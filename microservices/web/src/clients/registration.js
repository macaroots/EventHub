import { api } from './http.js';

const call = api(process.env.REGISTRATION_URL || 'http://registration:3001');
const id = encodeURIComponent;

export const register = (req, activityId) => call('/registrations', req, { method: 'POST', body: { activityId } });
export const listRegistrations = (req) => call('/registrations', req);
export const getRegistration = (req, registrationId) => call(`/registrations/${id(registrationId)}`, req);
