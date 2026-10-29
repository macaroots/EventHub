import express from 'express';
import { ActivityRepository } from './infrastructure/activity.repository.js';
import { RegistrationRepository } from './infrastructure/registration.repository.js';
import { RegistrationAppService } from './application/registration.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { MapRepository } from '../../shared/infrastructure/map.repository.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 


const messageBus = await RabbitMqMessageBus.connect();
const userRepository = new MapRepository();
const activityRepository = new ActivityRepository();
const registrationRepository = new RegistrationRepository();
const registrationService = new RegistrationAppService(activityRepository, registrationRepository, userRepository, messageBus);

// Isso pode ser definido aqui (Coreografia) ou no gateway (Orquestração)
messageBus.listen('EventCreated', e => registrationService.updateCapacity(e));
messageBus.listen('EventUpdated', e => registrationService.updateCapacity(e));
messageBus.listen('UserCreated', e => userRepository.add({id: e.userId}));

app.get('/activities', (req, res) => {
    let beans = activityRepository.list();
    res.json(beans);
});
app.get('/registrations', (req, res) => {
    let beans = registrationRepository.list();
    res.json(beans);
});
app.post('/registrations', async (req, res) => {
    let bean = req.body;
    console.log(req.body, 'post');
    try {
        const id = await registrationService.register(bean);
        res.json({ id });
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

