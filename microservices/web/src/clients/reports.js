import { api } from './http.js';

const call = api(process.env.REPORTS_URL || 'http://reports:3006');
const eventPath = (id) => `/reports/events/${encodeURIComponent(id)}`;
const options = () => ({ signal: AbortSignal.timeout(30000) });

export const getEvent = (req, id) => call(`${eventPath(id)}?format=json&include=activities,payments`, req, options());
export const getParticipants = (req, id) => {
    const query = new URLSearchParams({ format: 'json', limit: '25' });
    if (typeof req.query.page === 'string') query.set('page', req.query.page);
    return call(`${eventPath(id)}/participants?${query}`, req, options());
};
export const downloadEvent = (req, id) => call(`${eventPath(id)}?format=xlsx&include=activities,participants,payments`, req, options());
