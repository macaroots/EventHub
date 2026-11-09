import { Router } from 'express';
import * as identity from '../clients/identity.js';

export const router = Router();

router.get('/register', (req, res) => res.layout('auth/register'));
router.get('/login', (req, res) => res.layout('auth/login', { next: req.query.next }));

// Só caminhos locais: evita open redirect (ex.: next=//site.com).
const safeNext = (next) => (/^\/(?![/\\])/.test(next ?? '') ? next : '/organizers/events');

const cookieOptions = (seconds) => ({
    httpOnly: true,                                // JS do browser não lê (XSS)
    secure: process.env.NODE_ENV === 'production', // só HTTPS em produção
    sameSite: 'strict',                            // mitiga CSRF
    maxAge: seconds * 1000,                        // mesma validade do JWT
});

router.post('/register', async (req, res) => {
    const { name, username, email, password, confirmation } = req.body;
    const form = { name, username, email };
    if (password !== confirmation) return res.status(400).layout('auth/register', { error: 'As senhas não conferem', form });
    const response = await identity.register({ name, username, email, password });
    if (!response.ok) return res.status(400).layout('auth/register', { error: await identity.errorMessage(response), form });
    res.redirect('/auth/login');
});

router.post('/login', async (req, res) => {
    const response = await identity.login({ username: req.body.username, password: req.body.password });
    if (!response.ok) {
        return res.status(400).layout('auth/login', { error: await identity.errorMessage(response), next: req.body.next });
    }
    // O identity devolve o JWT no cookie access_token (do domínio dele); o BFF o guarda no próprio cookie.
    const token = response.headers.getSetCookie()
        .map(c => c.match(/^access_token=([^;]+)/)?.[1]).find(Boolean);
    const { expiresIn } = await response.json();
    const user = await identity.me(token).then(r => (r.ok ? r.json() : null));
    res.cookie('token', token, cookieOptions(expiresIn));
    res.cookie('name', user?.name ?? '', cookieOptions(expiresIn)); // só para exibir no menu
    res.redirect(safeNext(req.body.next));
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.clearCookie('name');
    res.redirect('/');
});
