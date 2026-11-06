import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as registration from '../clients/registration.js';
import { action, json } from './helpers.js';

// Gestão das inscrições de uma atividade (organizador do evento ou admin; quem autoriza é o registration).
export const router = Router();
router.use(authenticate);

const STATUSES = ['pending', 'awaiting_payment', 'waitlisted', 'confirmed', 'canceled'];
// As ações voltam para a lista da atividade (activityId vem num campo hidden).
const listPage = (req) => `/organizers/activities/${encodeURIComponent(req.body.activityId)}/registrations`;
const checkInPage = (activityId) => `/organizers/activities/${encodeURIComponent(activityId)}/checkin`;

router.get('/activities/:id/registrations', async (req, res) => {
    const data = await json(await registration.listActivityRegistrations(req, req.params.id));
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const counts = Object.fromEntries(STATUSES.map(s => [s, data.registrations.filter(r => r.status == s).length]));
    const registrations = data.registrations.filter(r => !status || r.status == status);
    res.layout('organizers/registrations', { ...data, registrations, counts, status });
});
router.post('/registrations/:id/cancel',
    action((req) => registration.cancelRegistration(req, req.params.id, req.body.reason), listPage));
router.post('/registrations/:id/requirements/:requirementId/fulfill',
    action((req) => registration.fulfillRequirement(req, req.params.id, req.params.requirementId), listPage));

// Check-in (ADR 012). ?display=1: só o código, em letras grandes, para o projetor (recarrega sozinha).
router.get('/activities/:id/checkin', async (req, res) => {
    const data = await json(await registration.getCheckIn(req, req.params.id));
    res.layout(req.query.display ? 'organizers/checkin-display' : 'organizers/checkin', data);
});
router.post('/activities/:id/checkin/open',
    action((req) => registration.openCheckIn(req, req.params.id), (req) => checkInPage(req.params.id)));
router.post('/activities/:id/checkin/close',
    action((req) => registration.closeCheckIn(req, req.params.id), (req) => checkInPage(req.params.id)));
router.post('/registrations/:id/checkin',
    action((req) => registration.checkInManually(req, req.params.id), (req) => checkInPage(req.body.activityId)));
