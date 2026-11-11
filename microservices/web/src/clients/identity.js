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

const jsonResponse = (data) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
});

// O identity atual não possui endpoint de busca por vários IDs.
// Reaproveita o endpoint autenticado já existente para manter o BFF compatível.
export const findByIds = async (req, ids) => {
    const response = await listUsers(req);
    if (!response.ok) return response;
    const users = await response.json();
    const wanted = new Set(ids);
    return jsonResponse(users.filter(user => wanted.has(user.id)));
};

// O identity atual também não expõe busca por e-mail no endpoint público.
export const findByEmail = async (req, email) => {
    const response = await listUsers(req);
    if (!response.ok) return response;
    const users = await response.json();
    const normalizedEmail = email.trim().toLowerCase();
    return jsonResponse(users.filter(user =>
        (user.email || user.username || '').toLowerCase() == normalizedEmail));
};
