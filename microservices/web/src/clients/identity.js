import { api } from './http.js';

const call = api(process.env.IDENTITY_URL || 'http://identity:3003');

export const login = (credentials) => call('/auth', null, { method: 'POST', body: credentials });
