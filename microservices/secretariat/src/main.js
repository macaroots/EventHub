import express from 'express';
import { EventAppService } from './application/event.app-service.js';
import { ActivityAppService } from './application/activity.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { DatabaseSync } from 'node:sqlite';
import { EventSqliteRepository } from './infrastructure/event.sqlite.repository.js';
import { ActivitySqliteRepository } from './infrastructure/activity.sqlite.repository.js';

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { CrudController } from '../../shared/application/CrudController.js';
import { EventController } from './application/event.controller.js';
import { authenticate } from '../../shared/auth/jwt.js';

mkdirSync(resolve('data'), { recursive: true });
const database = new DatabaseSync(join(resolve('data'), 'secretariat.db'));

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(authenticate());

const messageBus = await RabbitMqMessageBus.connect();
const eventRepository = new EventSqliteRepository(database);
const activityRepository = new ActivitySqliteRepository(database);
const eventService = new EventAppService(eventRepository, activityRepository, messageBus);
const activityService = new ActivityAppService(activityRepository, eventRepository, messageBus);

const eventController = new EventController(eventService);
const activityController = new CrudController(activityService);

app.get('/events/:id/activities', activityController.handle(async (req, res) => {
    res.json(await activityService.list({ eventId: req.params.id }, req.user));
}));
app.use('/events', eventController.getRouter());
app.use('/activities', activityController.getRouter());

await messageBus.consume("secretariat");

app.listen(port, () => {
    console.log(`Secretariat listening on port http://localhost:${port}`)
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})
