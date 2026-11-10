import express from 'express';
import path from 'node:path';
import { apiDocs } from '../../shared/application/api-docs.js';
import { UserSqliteRepository } from './infrastructure/user.sqlite.repository.js';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { UserAppService } from './application/user.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { OutboxMessageBus } from '../../shared/messaging/outbox-message-bus.js';
import { authenticate } from '../../shared/auth/jwt.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(apiDocs(path.join(import.meta.dirname, 'openapi.yaml')));

const database = openDatabase('identity');
// Outbox/inbox no banco do serviço; RabbitMQ como transporte.
const messageBus = new OutboxMessageBus(database, await RabbitMqMessageBus.connect(), { source: 'identity' });
const userRepository = new UserSqliteRepository(database);
const userService = new UserAppService(userRepository, messageBus);

app.get('/users', authenticate(), (req, res) => {
    const { username } = req.query;
    if (username == null) return res.json(userRepository.list());
    const user = userRepository.getByUsername(username);
    if (!user) return res.status(404).json(`User ${username} not found`);
    res.json(user);
});

app.post('/users', async (req, res) => {
    let bean = req.body;
    try {
        const id = await userService.signin(bean);
        res.json({ id });
    } catch (e) {
        res.status(400).json(e.message);
    }
});

// Suporte para POST /auth e POST /auth/login
const handleAuth = async (req, res) => {
    let bean = req.body;
    try {
        const { user, token } = await userService.authenticate(bean);
        res.json({ user, token });
    } catch (e) {
        res.status(400).json(e.message);
    }
};

app.post('/auth', handleAuth);
app.post('/auth/login', handleAuth);
app.post('/auth/register', async (req, res) => {
    let bean = req.body;
    try {
        const id = await userService.signin(bean);
        res.json({ id });
    } catch (e) {
        res.status(400).json(e.message);
    }
});

await messageBus.consume("identity");
await userService.seedAdmin({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD });

app.listen(port, () => {
    console.log(`Identity listening on port http://localhost:${port}`)
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
});
