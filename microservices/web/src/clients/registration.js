import { api } from './http.js';

const call = api(process.env.REGISTRATION_URL || 'http://registration:3000');
const id = encodeURIComponent;

export const register = (req, activityId) => call('/registrations', req, { method: 'POST', body: { activityId } });
export const listRegistrations = (req) => call('/registrations', req);
export const getRegistration = (req, registrationId) => call(`/registrations/${id(registrationId)}`, req);
export const cancelRegistration = (req, registrationId, reason) => call(`/registrations/${id(registrationId)}/cancel`, req, { method: 'POST', body: { reason } });
// Ordem da fila de espera (só ids).
export const getWaitlist = (req, activityId) => call(`/activities/${id(activityId)}/waitlist`, req);
// Gestão (organizador do evento ou admin).
export const listActivityRegistrations = (req, activityId) => call(`/activities/${id(activityId)}/registrations`, req);
export const fulfillRequirement = (req, registrationId, requirementId) =>
    call(`/registrations/${id(registrationId)}/requirements/${id(requirementId)}/fulfill`, req, { method: 'POST' });
// Check-in (ADR 012). Gestão: painel, abrir (código novo), fechar e marcar na mão. Participante: informa o código.
export const getCheckIn = (req, activityId) => call(`/activities/${id(activityId)}/checkin`, req);
export const openCheckIn = (req, activityId) => call(`/activities/${id(activityId)}/checkin/open`, req, { method: 'POST' });
export const closeCheckIn = (req, activityId) => call(`/activities/${id(activityId)}/checkin/close`, req, { method: 'POST' });
export const checkIn = (req, activityId, code) => call(`/activities/${id(activityId)}/checkin`, req, { method: 'POST', body: { code } });
export const checkInManually = (req, registrationId) => call(`/registrations/${id(registrationId)}/checkin`, req, { method: 'POST' });
