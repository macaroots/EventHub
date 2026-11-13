import { Router } from 'express';
import * as identity from '../clients/identity.js';

export const router = Router();

router.get('/register', (req, res) => res.layout('auth/register', { isAuthPage: true }));
router.get('/login', (req, res) => res.layout('auth/login', { next: req.query.next, isAuthPage: true }));

// Só caminhos locais: evita open redirect (ex.: next=//site.com).
const safeNext = (next) => (/^\/(?![/\\])/.test(next ?? '') ? next : '/organizers/events');

router.post('/login', async (req, res) => {
    const form = req.body ?? {};
    try {
        const response = await identity.login(form);
        if (!response.ok) {
            let errorMsg = 'Credenciais inválidas';
            try {
                const data = await response.json();
                errorMsg = data.error?.message || data.message || JSON.stringify(data);
            } catch {
                const text = await response.text();
                if (text) errorMsg = text;
            }
            return res.status(400).layout('auth/login', { error: errorMsg, next: form.next, isAuthPage: true });
        }
        
        const { token } = await response.json();
        if (token) {
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000,
            });
        }
        return res.redirect(safeNext(form.next));
    } catch (err) {
        return res.status(500).layout('auth/login', { 
            error: 'Não foi possível conectar ao serviço de autenticação. Tente novamente mais tarde.',
            next: form.next,
            isAuthPage: true 
        });
    }
});

router.post('/register', async (req, res) => {
    const { username, email, password } = req.body ?? {};
    const normalizedEmail = (email || '').trim().toLowerCase();

    const payload = {
        email: normalizedEmail,
        username,
        password
    };

    try {
        const response = await identity.register(payload);
        if (!response.ok) {
            let errorMsg = 'Erro ao criar conta';
            try {
                const data = await response.json();
                errorMsg = data.error?.message || data.message || JSON.stringify(data);
            } catch {
                const text = await response.text();
                if (text) errorMsg = text;
            }
            return res.status(400).layout('auth/register', {
                error: errorMsg,
                form: { email: normalizedEmail, username },
                isAuthPage: true,
            });
        }

        // Tentar autenticar automaticamente após cadastro
        try {
            const loginRes = await identity.login({ username: payload.username, password });
            if (loginRes.ok) {
                const { token } = await loginRes.json();
                if (token) {
                    res.cookie('token', token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: 60 * 60 * 1000,
                    });
                    return res.redirect('/organizers/events');
                }
            }
        } catch {
            // Se falhar o auto-login silencioso, redireciona para a página de login
        }

        return res.redirect('/auth/login');
    } catch (err) {
        return res.status(500).layout('auth/register', { 
            error: 'Não foi possível conectar ao serviço de autenticação. Tente novamente mais tarde.',
            form: { email: normalizedEmail, username },
            isAuthPage: true
        });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.clearCookie('name');
    res.redirect('/');
});
