import express from 'express';
import { EventAppService } from './application/event.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { DatabaseSync } from 'node:sqlite';
import { EventSqliteRepository } from './infrastructure/event.sqlite.repository.js';

import { join, resolve } from "node:path";
import { CrudController } from '../../shared/application/CrudController.js';

const database = new DatabaseSync(join(resolve('data', 'registration')));

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 

const messageBus = await RabbitMqMessageBus.connect();
const eventRepository = new EventSqliteRepository(database);
const eventService = new EventAppService(eventRepository, messageBus);

const eventController = new CrudController(eventService, eventRepository);

app.use('/events', eventController.getRouter());

await messageBus.consume("secretariat");

app.listen(port, () => {
    console.log(`Secretariat listening on port http://localhost:${port}`)
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})