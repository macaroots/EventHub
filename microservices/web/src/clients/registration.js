import { api } from './http.js';

const call = api(process.env.REGISTRATION_URL || 'http://registration:3001');
const id = encodeURIComponent;

export const register = (req, activityId) => call('/registrations', req, { method: 'POST', body: { activityId } });
export const listRegistrations = (req) => call('/registrations', req);
export const getRegistration = (req, registrationId) => call(`/registrations/${id(registrationId)}`, req);
export const cancelRegistration = (req, registrationId, reason) => call(`/registrations/${id(registrationId)}/cancel`, req, { method: 'POST', body: { reason } });
// Gestão (organizador do evento ou admin).
export const listActivityRegistrations = (req, activityId) => call(`/activities/${id(activityId)}/registrations`, req);
export const fulfillRequirement = (req, registrationId, requirementId) =>
    call(`/registrations/${id(registrationId)}/requirements/${id(requirementId)}/fulfill`, req, { method: 'POST' });
