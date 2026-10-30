import express from 'express';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { MapRepository } from '../../shared/infrastructure/map.repository.js';
import { PaymentAppService } from './application/payment.app-service.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 

const messageBus = await RabbitMqMessageBus.connect();
const paymentRepository = new MapRepository();
const paymentService = new PaymentAppService(paymentRepository, messageBus);

// Isso pode ser definido aqui (Coreografia) ou no gateway (Orquestração)
messageBus.listen('WaitingPayment', e => paymentService.charge(e));

app.get('/payments', (req, res) => {
    let beans = paymentRepository.list();
    res.json(beans);
});
app.post('/payments', async (req, res) => {
    let bean = req.body;
    console.log(req.body, 'post');
    try {
        const id = await paymentService.pay({paymentId, receipt: bean.receipt});
        res.json({ id });
    } catch (e) {
        res.status(400).json(e.message);
    }
});

await messageBus.consume("payment");

app.listen(port, () => {
    console.log(`Payment listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

