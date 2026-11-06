import express from 'express';
import path from 'node:path';
import { apiDocs } from '../../shared/application/api-docs.js';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import { openDatabase } from '../../shared/infrastructure/sqlite.js';
import { PaymentSqliteRepository } from './infrastructure/payment.sqlite.repository.js';
import { PaymentAppService } from './application/payment.app-service.js';
import { FakePaymentGateway } from './infrastructure/fake-payment.gateway.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(apiDocs(path.join(import.meta.dirname, 'openapi.yaml')));

const messageBus = await RabbitMqMessageBus.connect();
const paymentRepository = new PaymentSqliteRepository(openDatabase('payment'));
const paymentService = new PaymentAppService(paymentRepository, new FakePaymentGateway(), messageBus);

// Isso pode ser definido aqui (Coreografia) ou no gateway (Orquestração)
messageBus.listen('PaymentRequested', e => paymentService.charge(e));
messageBus.listen('RegistrationCanceled', e => paymentService.cancelByRegistration(e));

app.get('/payments', (req, res) => {
    let beans = paymentRepository.list();
    res.json(beans);
});
app.get('/payments/:id', (req, res) => {
    const payment = paymentRepository.getById(req.params.id);
    if (!payment) return res.status(404).send('payment not found');
    res.json(payment);
});
app.post('/payments/:id/pay', async (req, res) => {
    try {
        const payment = await paymentService.pay({ paymentId: req.params.id, receipt: req.body.receipt });
        res.json(payment);
    } catch (e) {
        res.status(400).send(e.message);
    }
});

await messageBus.consume("payment");

app.listen(port, () => {
    console.log(`Payment listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

