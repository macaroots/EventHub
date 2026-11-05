import { api } from './http.js';

const call = api(process.env.SECRETARIAT_URL || 'http://secretariat:3002');

export const listEvents = (req) => call('/events', req);
export const createEvent = (req, event) => call('/events', req, { method: 'POST', body: event });
