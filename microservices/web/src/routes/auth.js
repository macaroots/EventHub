import { Router } from 'express';
import * as identity from '../clients/identity.js';

export const router = Router();

router.get('/register', (req, res) => res.layout('auth/register'));
router.get('/login', (req, res) => res.layout('auth/login', { next: req.query.next }));

// Só caminhos locais: evita open redirect (ex.: next=//site.com).
const safeNext = (next) => (/^\/(?![/\\])/.test(next ?? '') ? next : '/organizers/events');

router.post('/login', async (req, res) => {
    const response = await identity.login(req.body);
    if (!response.ok) {
        return res.status(400).layout('auth/login', { error: await response.text(), next: req.body.next });
    }
    const { token } = await response.json();
    res.cookie('token', token, {
        httpOnly: true,                                // JS do browser não lê (XSS)
        secure: process.env.NODE_ENV === 'production', // só HTTPS em produção
        sameSite: 'strict',                            // mitiga CSRF
        maxAge: 60 * 60 * 1000,                        // 1h
    });
    res.redirect(safeNext(req.body.next));
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});
