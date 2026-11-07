import express from 'express';
import path from 'node:path';
import { apiDocs } from '../../shared/application/api-docs.js';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { ActivitySqliteRepository } from './infrastructure/activity.sqlite.repository.js';
import { RegistrationSqliteRepository } from './infrastructure/registration.sqlite.repository.js';
import { EventSqliteRepository } from './infrastructure/event.sqlite.repository.js';
import { ParticipantSqliteRepository } from './infrastructure/participant.sqlite.repository.js';
import { CheckInSqliteRepository } from './infrastructure/check-in.sqlite.repository.js';
import { AttendanceSqliteRepository } from './infrastructure/attendance.sqlite.repository.js';
import { RegistrationAppService } from './application/registration.app-service.js';
import { CheckInAppService } from './application/check-in.app-service.js';
import { CertificateAppService } from './application/certificate.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { OutboxMessageBus } from '../../shared/messaging/outbox-message-bus.js';
import { authenticate } from '../../shared/auth/jwt.js';
import { ConcurrencyError, DomainError, ForbiddenError, NotFoundError } from '../../shared/domain/errors.js';

const database = openDatabase('registration');

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(apiDocs(path.join(import.meta.dirname, 'openapi.yaml')));
app.use(authenticate());


// Outbox/inbox no banco do serviço; RabbitMQ como transporte.
const messageBus = new OutboxMessageBus(database, await RabbitMqMessageBus.connect(), { source: 'registration' });
const participantRepository = new ParticipantSqliteRepository(database);
const eventRepository = new EventSqliteRepository(database);
const registrationRepository = new RegistrationSqliteRepository(database);
const activityRepository = new ActivitySqliteRepository(database, registrationRepository);
const checkInRepository = new CheckInSqliteRepository(database);
const attendanceRepository = new AttendanceSqliteRepository(database);
const registrationService = new RegistrationAppService(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus,
    { paymentWindowMinutes: Number(process.env.PAYMENT_WINDOW_MINUTES ?? 30), attendanceRepository });
const checkInService = new CheckInAppService({ activityRepository, registrationRepository, eventRepository, participantRepository,
    checkInRepository, attendanceRepository, messageBus });
const certificateService = new CertificateAppService({ activityRepository, eventRepository, participantRepository, attendanceRepository, messageBus });
// Reservas sem pagamento dentro da janela liberam a vaga para a fila de espera.
setInterval(() => registrationService.expireOverduePayments().catch(e => console.error('expireOverduePayments falhou:', e.message)), 60_000);

// Isso pode ser definido aqui (Coreografia) ou no gateway (Orquestração)
messageBus.listen('EventPublished', e => registrationService.publishEvent(e));
messageBus.listen('EventCanceled', e => registrationService.cancelEvent(e));
messageBus.listen('EventEnded', e => certificateService.endEvent(e));
messageBus.listen('EventOrganizersChanged', e => registrationService.changeOrganizers(e));
messageBus.listen('PaymentConfirmed', e => registrationService.confirmPayment(e));
messageBus.listen('PaymentDenied', e => registrationService.denyPayment(e));
messageBus.listen('UserCreated', e => registrationService.upsertParticipant(e));
messageBus.listen('UserUpdated', e => registrationService.upsertParticipant(e));

// Erros de domínio → 4xx; os demais são falha interna → 500 (sem vazar a mensagem).
const errorStatus = e => e instanceof NotFoundError ? 404 : e instanceof ForbiddenError ? 403
    : e instanceof ConcurrencyError ? 409 : e instanceof DomainError ? 400 : 500;
const handle = (fn, status = 200) => async (req, res) => {
    try {
        res.status(status).json(await fn(req));
    } catch (e) {
        const code = errorStatus(e);
        if (code == 500) console.error(`${req.method} ${req.path} falhou:`, e);
        res.status(code).send(code == 500 ? 'Internal server error' : e.message);
    }
};

app.get('/registrations', handle(req => registrationService.listRegistrations(req.user)));
app.get('/registrations/:id', handle(req => registrationService.getRegistration(req.params.id, req.user)));
// Gestão (organizador do evento ou admin).
app.get('/activities/:id/waitlist', handle(req => registrationService.getWaitlist(req.params.id)));
app.get('/activities/:id/registrations', handle(req => registrationService.listActivityRegistrations(req.params.id, req.user)));
app.post('/registrations/:id/cancel', handle(req => registrationService.cancelRegistration(req.params.id, req.body, req.user)));
app.post('/registrations/:id/requirements/:requirementId/fulfill',
    handle(req => registrationService.fulfillRequirement(req.params.id, req.params.requirementId, req.user)));
// Check-in (ADR 012): gestão abre/fecha e marca na mão; o participante informa o código.
app.get('/activities/:id/checkin', handle(req => checkInService.get(req.params.id, req.user)));
app.post('/activities/:id/checkin/open', handle(req => checkInService.open(req.params.id, req.user)));
app.post('/activities/:id/checkin/close', handle(req => checkInService.close(req.params.id, req.user)));
app.post('/activities/:id/checkin', handle(req => checkInService.checkIn({ activityId: req.params.id, code: req.body.code }, req.user)));
app.post('/registrations/:id/checkin', handle(req => checkInService.checkInManually(req.params.id, req.user)));
app.post('/registrations', handle(req => registrationService.register(req.body, req.user.id), 201));

await messageBus.consume("registration");


app.listen(port, () => {
    console.log(`Registration listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

