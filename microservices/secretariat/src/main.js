import express from 'express';
import { EventAppService } from './application/event.app-service.js';
import { ActivityAppService } from './application/activity.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { EventSqliteRepository } from './infrastructure/event.sqlite.repository.js';
import { ActivitySqliteRepository } from './infrastructure/activity.sqlite.repository.js';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { EventController } from './application/event.controller.js';
import { ActivityController } from './application/activity.controller.js';
import { authenticate } from '../../shared/auth/jwt.js';

const database = openDatabase('secretariat');

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());

const messageBus = await RabbitMqMessageBus.connect();
const eventRepository = new EventSqliteRepository(database);
const activityRepository = new ActivitySqliteRepository(database);
const eventService = new EventAppService(eventRepository, activityRepository, messageBus);
const activityService = new ActivityAppService(activityRepository, eventRepository);

const eventController = new EventController(eventService);
const activityController = new ActivityController(activityService);

app.use(eventController.getPublicRouter());
app.use(authenticate());
app.use(eventController.getRouter());
app.use(activityController.getRouter());

await messageBus.consume("secretariat");

app.listen(port, () => {
    console.log(`Secretariat listening on port http://localhost:${port}`)
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})
