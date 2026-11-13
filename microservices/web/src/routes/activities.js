import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as secretariat from '../clients/secretariat.js';
import { action, json, orNull, numberOrNull } from './helpers.js';

export const router = Router();
router.use(authenticate);

// Formulário → Activity. Só há a regra minimumAge; vazio = sem regra.
const activityForm = ({ name, description, location, startsAt, endsAt, capacity, price, minimumAge }) => ({
    name, description, location,
    startsAt: orNull(startsAt),
    endsAt: orNull(endsAt),
    capacity: numberOrNull(capacity),
    price: numberOrNull(price) ?? 0,
    rules: orNull(minimumAge) ? [{ type: 'minimumAge', age: Number(minimumAge) }] : [],
});
const eventPage = (eventId) => `/organizers/events/${encodeURIComponent(eventId)}`;
const show = (req) => `/organizers/activities/${encodeURIComponent(req.params.id)}`;

router.get('/events/:eventId/activities/new', (req, res) => {
    res.layout('organizers/activity', { activity: { eventId: req.params.eventId, rules: [] } });
});
router.post('/events/:eventId/activities', action(
    (req) => secretariat.createActivity(req, { ...activityForm(req.body), eventId: req.params.eventId }),
    (req) => `${eventPage(req.params.eventId)}?tab=activities`,
    (req) => `${eventPage(req.params.eventId)}/activities/new`));

router.get('/activities/:id', async (req, res) => {
    const activity = await json(await secretariat.getActivity(req, req.params.id));
    res.layout('organizers/activity', { activity });
});
router.post('/activities/:id', action((req) => secretariat.updateActivity(req, req.params.id, activityForm(req.body)), show));
router.post('/activities/:id/delete', action(
    (req) => secretariat.deleteActivity(req, req.params.id),
    (req) => eventPage(req.body.eventId),
    show));
