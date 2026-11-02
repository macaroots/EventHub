import express from 'express';
import { ActivityRepository } from './infrastructure/activity.repository.js';
import { RegistrationRepository } from './infrastructure/registration.repository.js';
import { RegistrationAppService } from './application/registration.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { MapRepository } from '../../shared/infrastructure/map.repository.js';
import { authenticate } from '../../shared/auth/jwt.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authenticate());


const messageBus = await RabbitMqMessageBus.connect();
const participantRepository = new MapRepository();
const eventRepository = new MapRepository();
const activityRepository = new ActivityRepository();
const registrationRepository = new RegistrationRepository();
const registrationService = new RegistrationAppService(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus);

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
app.post('/registrations', async (req, res) => {
    try {
        const registration = await registrationService.register(req.body, req.user.id);
        res.status(201).json(registration);
    } catch (e) {
        res.status(400).json(e.message);
    }
});

await messageBus.consume("registration");


app.listen(port, () => {
    console.log(`Registration listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

