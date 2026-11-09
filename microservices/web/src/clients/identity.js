import { api } from './http.js';

const call = api(process.env.IDENTITY_URL || 'http://identity:3003');
// Rotas /internal do identity: autenticadas pelo X-Internal-Token (serviço a serviço), não pelo JWT.
const internal = (path, opts = {}) =>
    call(path, null, { ...opts, headers: { 'x-internal-token': process.env.INTERNAL_API_TOKEN, ...opts.headers } });

export const register = (body) => call('/auth/register', null, { method: 'POST', body }); // {name, username, email, password}
// {username (ou e-mail), password} → Set-Cookie access_token=<JWT>; corpo {expiresIn}
export const login = (credentials) => call('/auth/login', null, { method: 'POST', body: credentials });
export const me = (token) => call('/me', null, { headers: { cookie: `access_token=${token}` } }); // {id, name, username, email}
export const findByEmail = (email) => internal(`/internal/users?email=${encodeURIComponent(email)}`); // [{id, name, email}]
export const findByIds = (ids) => internal('/internal/users/batch', { method: 'POST', body: { ids } }); // [{id, name, email}], só ativos

// Erros do identity vêm como {error: {code, message}}.
export const errorMessage = async (response) => {
    const text = await response.text();
    try { return JSON.parse(text).error?.message ?? text; } catch { return text; }
};
