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

const internalHeaders = () => ({ 'x-internal-token': process.env.INTERNAL_API_TOKEN });
export const findByIds = ids => call('/internal/users/batch', null, { method: 'POST', body: { ids }, headers: internalHeaders() });
export const findByEmail = email => call(`/internal/users?email=${encodeURIComponent(email)}`, null, { headers: internalHeaders() });
export const errorMessage = async response => {
    const text = await response.text();
    try {
        const data = JSON.parse(text);
        return data.error?.message || data.message || text;
    } catch { return text; }
};
