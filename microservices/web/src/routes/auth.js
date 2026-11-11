import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import * as identity from '../clients/identity.js';

export const router = Router();
const safeNext = next => (/^\/(?![/\\])/.test(next ?? '') ? next : '/');
const cookieOptions = seconds => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: seconds * 1000,
});

router.get('/register', (req, res) => res.layout('auth/register', { isAuthPage: true }));
router.get('/login', (req, res) => res.layout('auth/login', { next: req.query.next, isAuthPage: true }));

router.post('/register', async (req, res) => {
    const { name, email, password, confirmation } = req.body;
    const username = req.body.username || randomUUID().replaceAll('-', '').slice(0, 30);
    const form = { name, username, email };
    if (confirmation !== undefined && password !== confirmation) {
        return res.status(400).layout('auth/register', { error: 'As senhas não conferem', form, isAuthPage: true });
    }
    try {
        const response = await identity.register({ name, username, email, password });
        if (!response.ok) return res.status(400).layout('auth/register', { error: await identity.errorMessage(response), form, isAuthPage: true });
        res.redirect('/auth/login');
    } catch {
        res.status(503).layout('auth/register', { error: 'Não foi possível conectar ao serviço de identidade.', form, isAuthPage: true });
    }
});

router.post('/login', async (req, res) => {
    try {
        const response = await identity.login(req.body);
        if (!response.ok) return res.status(400).layout('auth/login', { error: await identity.errorMessage(response), next: req.body.next, isAuthPage: true });
        const { token, expiresIn } = await response.json();
        if (!token) throw new Error('Identity did not return a token');
        res.cookie('token', token, cookieOptions(expiresIn || 3600));
        res.redirect(safeNext(req.body.next));
    } catch {
        res.status(503).layout('auth/login', { error: 'Não foi possível conectar ao serviço de identidade.', next: req.body.next, isAuthPage: true });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});