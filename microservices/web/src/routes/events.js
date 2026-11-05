import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as secretariat from '../clients/secretariat.js';
import * as identity from '../clients/identity.js';
import { action, json, orNull } from './helpers.js';

export const router = Router();
router.use(authenticate);

const eventForm = ({ name, information, startDate, endDate }) =>
    ({ name, information, startDate: orNull(startDate), endDate: orNull(endDate) });
const list = () => '/organizers/events';
const show = (req) => `/organizers/events/${encodeURIComponent(req.params.id)}`;

router.get('/events', async (req, res) => {
    const events = await json(await secretariat.listEvents(req));
    res.layout('organizers/events', { events });
});
router.post('/events', action(
    (req) => secretariat.createEvent(req, eventForm(req.body)),
    async (req, response) => `/organizers/events/${(await response.json()).id}`,
    list));

// Página do evento: dados, organizers (ids → usernames via identity) e atividades.
router.get('/events/:id', async (req, res) => {
    const [event, users] = await Promise.all([
        secretariat.getEvent(req, req.params.id).then(json),
        identity.listUsers().then(json),
    ]);
    const usernames = Object.fromEntries(users.map(u => [u.id, u.username]));
    const organizers = event.organizers.map(id => ({ id, username: usernames[id] ?? id }));
    res.layout('organizers/event', { event, organizers });
});
router.post('/events/:id', action((req) => secretariat.updateEvent(req, req.params.id, eventForm(req.body)), show));
router.post('/events/:id/delete', action((req) => secretariat.deleteEvent(req, req.params.id), list, show));
router.post('/events/:id/publish', action((req) => secretariat.publishEvent(req, req.params.id), show));
router.post('/events/:id/cancel', action((req) => secretariat.cancelEvent(req, req.params.id, req.body.reason), show));

// Organizers: o formulário usa username; a secretaria guarda só o id do usuário.
router.post('/events/:id/organizers', action(async (req) => {
    const users = await json(await identity.listUsers());
    const user = users.find(u => u.username == req.body.username);
    if (!user) return new Response(`User ${req.body.username} not found`, { status: 404 });
    return secretariat.addOrganizer(req, req.params.id, user.id);
}, show));
router.post('/events/:id/organizers/:userId/delete',
    action((req) => secretariat.removeOrganizer(req, req.params.id, req.params.userId), show));
