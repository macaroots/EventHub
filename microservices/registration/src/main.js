import express from 'express';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { ActivitySqliteRepository } from './infrastructure/activity.sqlite.repository.js';
import { RegistrationSqliteRepository } from './infrastructure/registration.sqlite.repository.js';
import { EventSqliteRepository, ParticipantSqliteRepository } from './infrastructure/projection.sqlite.repository.js';
import { RegistrationAppService } from './application/registration.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { authenticate } from '../../shared/auth/jwt.js';
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors.js';

const database = openDatabase('registration');

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authenticate());


const messageBus = await RabbitMqMessageBus.connect();
const participantRepository = new ParticipantSqliteRepository(database);
const eventRepository = new EventSqliteRepository(database);
const registrationRepository = new RegistrationSqliteRepository(database);
const activityRepository = new ActivitySqliteRepository(database, registrationRepository);
const registrationService = new RegistrationAppService(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus,
    { paymentWindowMinutes: Number(process.env.PAYMENT_WINDOW_MINUTES ?? 30) });
// Reservas sem pagamento dentro da janela liberam a vaga para a fila de espera.
setInterval(() => registrationService.expireOverduePayments().catch(e => console.error('expireOverduePayments falhou:', e.message)), 60_000);

// Isso pode ser definido aqui (Coreografia) ou no gateway (Orquestração)
messageBus.listen('ActivityCreated', e => registrationService.upsertActivity(e));
messageBus.listen('ActivityUpdated', e => registrationService.upsertActivity(e));
messageBus.listen('ActivityDeleted', e => registrationService.deleteActivity(e));
for (const type of ['EventCreated', 'EventUpdated', 'EventPublished', 'EventCanceled']) {
    messageBus.listen(type, e => registrationService.updateEvent(e));
}
messageBus.listen('PaymentConfirmed', e => registrationService.confirmPayment(e));
messageBus.listen('PaymentDenied', e => registrationService.denyPayment(e));
messageBus.listen('UserCreated', e => registrationService.upsertParticipant(e));
messageBus.listen('UserUpdated', e => registrationService.upsertParticipant(e));

app.get('/activities', (req, res) => {
    let beans = activityRepository.list();
    res.json(beans);
});
app.get('/registrations', (req, res) => {
    res.json(registrationService.listRegistrations(req.user));
});
// Erros de domínio → status HTTP.
const handle = (fn, status = 200) => async (req, res) => {
    try {
        res.status(status).json(await fn(req));
    } catch (e) {
        res.status(e instanceof NotFoundError ? 404 : e instanceof ForbiddenError ? 403 : 400).send(e.message);
    }
};
app.get('/registrations/:id', handle(req => registrationService.getRegistration(req.params.id, req.user)));
// Gestão (organizador do evento ou admin).
app.get('/activities/:id/waitlist', handle(req => registrationService.getWaitlist(req.params.id)));
app.get('/activities/:id/registrations', handle(req => registrationService.listActivityRegistrations(req.params.id, req.user)));
app.post('/registrations/:id/cancel', handle(req => registrationService.cancelRegistration(req.params.id, req.body, req.user)));
app.post('/registrations/:id/requirements/:requirementId/fulfill',
    handle(req => registrationService.fulfillRequirement(req.params.id, req.params.requirementId, req.user)));
app.post('/registrations', async (req, res) => {
    try {
        const registration = await registrationService.register(req.body, req.user.id);
        res.status(201).json(registration);
    } catch (e) {
        res.status(400).send(e.message);
    }
});

await messageBus.consume("registration");


app.listen(port, () => {
    console.log(`Registration listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

