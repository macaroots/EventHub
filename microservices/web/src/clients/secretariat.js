import { api } from './http.js';

const call = api(process.env.SECRETARIAT_URL || 'http://secretariat:3002');
const id = encodeURIComponent;

export const listEvents = (req) => call('/events', req);
export const getEvent = (req, eventId) => call(`/events/${id(eventId)}`, req);
export const createEvent = (req, event) => call('/events', req, { method: 'POST', body: event });
export const updateEvent = (req, eventId, changes) => call(`/events/${id(eventId)}`, req, { method: 'PATCH', body: changes });
export const deleteEvent = (req, eventId) => call(`/events/${id(eventId)}`, req, { method: 'DELETE' });
export const publishEvent = (req, eventId) => call(`/events/${id(eventId)}/publish`, req, { method: 'POST' });
// Encerrar (depois do endDate) dispara os pedidos de certificado no registration.
export const endEvent = (req, eventId) => call(`/events/${id(eventId)}/end`, req, { method: 'POST' });
export const cancelEvent = (req, eventId, reason) => call(`/events/${id(eventId)}/cancel`, req, { method: 'POST', body: { reason } });
export const addOrganizer = (req, eventId, userId) => call(`/events/${id(eventId)}/organizers`, req, { method: 'POST', body: { userId } });
export const removeOrganizer = (req, eventId, userId) => call(`/events/${id(eventId)}/organizers/${id(userId)}`, req, { method: 'DELETE' });

export const getActivity = (req, activityId) => call(`/activities/${id(activityId)}`, req);
export const createActivity = (req, activity) => call('/activities', req, { method: 'POST', body: activity });
export const updateActivity = (req, activityId, changes) => call(`/activities/${id(activityId)}`, req, { method: 'PATCH', body: changes });
export const deleteActivity = (req, activityId) => call(`/activities/${id(activityId)}`, req, { method: 'DELETE' });

// Públicos (sem login): só eventos publicados.
export const listPublicEvents = () => call('/public/events');
export const getPublicEvent = (eventId) => call(`/public/events/${id(eventId)}`);
