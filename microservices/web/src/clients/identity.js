import { api } from './http.js';

const call = api(process.env.IDENTITY_URL || 'http://identity:3003');

// Suporta /auth/login e fallback para /auth
export const login = async (credentials) => {
    let res = await call('/auth/login', null, { method: 'POST', body: credentials });
    if (res.status === 404) {
        res = await call('/auth', null, { method: 'POST', body: credentials });
    }
    return res;
};

// Cadastro
export const register = async (userData) => {
    let res = await call('/auth/register', null, { method: 'POST', body: userData });
    if (res.status === 404) {
        res = await call('/users', null, { method: 'POST', body: userData });
    }
    return res;
};

export const listUsers = (req) => call('/users', req); // [{id, username, role}]
export const findUser = (req, username) => call(`/users?username=${encodeURIComponent(username)}`, req); // {id, username, role} ou 404
