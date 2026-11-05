import express from 'express';
import { UserSqliteRepository } from './infrastructure/user.sqlite.repository.js';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { UserAppService } from './application/user.app-service.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 

const messageBus = await RabbitMqMessageBus.connect();
const userRepository = new UserSqliteRepository(openDatabase('identity'));
const userService = new UserAppService(userRepository, messageBus);

app.get('/users', (req, res) => {
    let beans = userRepository.list();
    res.json(beans);
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
app.post('/auth', async (req, res) => {
    let bean = req.body;
    try {
        const { user, token } = await userService.authenticate(bean);
        res.json({ user, token });
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
})