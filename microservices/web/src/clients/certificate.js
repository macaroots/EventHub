import { api } from './http.js';

const call = api(process.env.CERTIFICATE_URL || 'http://certificate:3005');
const options = () => ({ signal: AbortSignal.timeout(30000) });

export const listCertificates = req => call('/certificates', req, options());
export const findForEvent = (req, eventId) => call(`/events/${encodeURIComponent(eventId)}/certificates`, req, { ...options(), method: 'POST' });
export const downloadCertificate = (req, id) => call(`/certificates/${encodeURIComponent(id)}/download`, req, options());
