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
const successShow = (req, message) => `${show(req)}?success=${encodeURIComponent(message)}`;

router.get('/events', async (req, res) => {
    const events = await json(await secretariat.listEvents(req));
    res.layout('organizers/events', { events });
});
router.post('/events', action(
    (req) => secretariat.createEvent(req, eventForm(req.body)),
    async (req, response) =>
        `/organizers/events/${(await response.json()).id}?success=${encodeURIComponent('Evento criado com sucesso.')}`,
    list));

// Página do evento: dados, organizers (ids → nomes via identity) e atividades.
router.get('/events/:id', async (req, res) => {
    const event = await secretariat.getEvent(req, req.params.id).then(json);
    const organizerIds = Array.isArray(event.organizers) ? event.organizers : [];
    let users = [];
    if (organizerIds.length) {
        try {
            users = await identity.findByIds(req, organizerIds).then(json);
        } catch (err) {
            console.error('Could not load event organizers:', err);
        }
    }
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const organizers = organizerIds.map(id => ({
        id,
        name: byId[id]?.name || byId[id]?.username || byId[id]?.email || (id == req.user?.sub ? req.user.username : null) || 'Organizador',
        email: byId[id]?.email,
    }));
    res.layout('organizers/event', { event, organizers });
});
router.post('/events/:id', action(
    (req) => secretariat.updateEvent(req, req.params.id, eventForm(req.body)),
    (req) => successShow(req, 'Alterações salvas com sucesso.'),
    show));
router.post('/events/:id/delete', action(
    (req) => secretariat.deleteEvent(req, req.params.id),
    () => `${list()}?success=${encodeURIComponent('Evento apagado com sucesso.')}`,
    show));
router.post('/events/:id/publish', action(
    (req) => secretariat.publishEvent(req, req.params.id),
    (req) => successShow(req, 'Evento publicado com sucesso.'),
    show));
router.post('/events/:id/end', action(
    (req) => secretariat.endEvent(req, req.params.id),
    (req) => successShow(req, 'Evento encerrado com sucesso.'),
    show));
router.post('/events/:id/cancel', action(
    (req) => secretariat.cancelEvent(req, req.params.id, req.body.reason),
    (req) => successShow(req, 'Evento cancelado com sucesso.'),
    show));

// Organizers: o formulário usa o e-mail; a secretaria guarda só o id do usuário.
router.post('/events/:id/organizers', action(async (req) => {
    // Composição no BFF (ADR 013): e-mail → id no identity, depois a secretaria.
    const response = await identity.findByEmail(req, req.body.email);
    if (!response.ok) return response;
    const [user] = await response.json();
    if (!user) return new Response(`Usuário ${req.body.email} não encontrado`, { status: 404 });
    return secretariat.addOrganizer(req, req.params.id, user.id);
}, show));
router.post('/events/:id/organizers/:userId/delete',
    action((req) => secretariat.removeOrganizer(req, req.params.id, req.params.userId), show));
