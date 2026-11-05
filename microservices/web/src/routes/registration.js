import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as secretariat from '../clients/secretariat.js';
import * as registration from '../clients/registration.js';
import { action, json } from './helpers.js';

// Fluxo do participante: evento público → inscrição → pendências (pagamento).
// Montado na raiz: authenticate por rota, não router.use (pegaria todas as rotas do app).
export const router = Router();

const eventPage = (eventId) => `/events/${encodeURIComponent(eventId)}`;
const registrationPage = (id) => `/registrations/${encodeURIComponent(id)}`;

router.get('/', async (req, res) => {
    const events = await json(await secretariat.listPublicEvents());
    res.layout('index', { events });
});

// Público. Só eventos publicados (404 nos demais).
router.get('/events/:id', async (req, res) => {
    const event = await json(await secretariat.getPublicEvent(req.params.id));
    res.layout('public/event', { event });
});

router.post('/activities/:id/registrations', authenticate, action(
    (req) => registration.register(req, req.params.id),
    async (req, response) => registrationPage((await response.json()).id),
    (req) => eventPage(req.body.eventId)));

router.get('/registrations', authenticate, async (req, res) => {
    const registrations = await json(await registration.listRegistrations(req));
    res.layout('registrations/list', { registrations: registrations.filter(r => r.userId == req.user.sub) });
});
router.get('/registrations/:id', authenticate, async (req, res) => {
    const item = await json(await registration.getRegistration(req, req.params.id));
    res.layout('registrations/show', { registration: item });
});
