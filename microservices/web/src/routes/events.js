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

// Página do evento: dados, organizers (ids → nomes via identity) e atividades.
router.get('/events/:id', async (req, res) => {
    const event = await secretariat.getEvent(req, req.params.id).then(json);
    const users = event.organizers.length ? await identity.findByIds(event.organizers).then(json) : [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const organizers = event.organizers.map(id => ({ id, name: byId[id]?.name ?? id, email: byId[id]?.email }));
    res.layout('organizers/event', { event, organizers });
});
router.post('/events/:id', action((req) => secretariat.updateEvent(req, req.params.id, eventForm(req.body)), show));
router.post('/events/:id/delete', action((req) => secretariat.deleteEvent(req, req.params.id), list, show));
router.post('/events/:id/publish', action((req) => secretariat.publishEvent(req, req.params.id), show));
router.post('/events/:id/end', action((req) => secretariat.endEvent(req, req.params.id), show));
router.post('/events/:id/cancel', action((req) => secretariat.cancelEvent(req, req.params.id, req.body.reason), show));

// Organizers: o formulário usa o e-mail; a secretaria guarda só o id do usuário.
router.post('/events/:id/organizers', action(async (req) => {
    // Composição no BFF (ADR 016): e-mail → id no identity, depois a secretaria.
    const response = await identity.findByEmail(req.body.email);
    if (!response.ok) return response;
    const [user] = await response.json();
    if (!user) return new Response(`Usuário ${req.body.email} não encontrado`, { status: 404 });
    return secretariat.addOrganizer(req, req.params.id, user.id);
}, show));
router.post('/events/:id/organizers/:userId/delete',
    action((req) => secretariat.removeOrganizer(req, req.params.id, req.params.userId), show));
