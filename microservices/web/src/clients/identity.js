import { api } from './http.js';

const call = api(process.env.IDENTITY_URL || 'http://identity:3003');

export const login = (credentials) => call('/auth', null, { method: 'POST', body: credentials });
export const listUsers = (req) => call('/users', req); // [{id, username, role}]
export const findUser = (req, username) => call(`/users?username=${encodeURIComponent(username)}`, req); // {id, username, role} ou 404
