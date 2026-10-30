import express from 'express';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 

app.set('view engine', 'ejs');
app.set('views', import.meta.dirname + '/views');

// const messageBus = await RabbitMqMessageBus.connect();

// // messageBus.listen('WaitingPayment', e => paymentService.charge(e.paymentId, e.amout));

app.use((req, res, next) => {
    res.layout = (view, data={}, layout='layout') => {
        console.log({data, layout, view});
        
        res.render(layout, {view, data});
    }
    next();
})

app.get('/', (req, res) => {
    res.layout('index');
});
app.get('/activity/:id/register/', (req, res) => {
    const id = req.params.id;
    const token = crypto.randomUUID();
    res.layout('redirect', {url: `/activity/${id}/register/${token}`, stages: [
        'Entra na fila, recebe uma senha (token)',
        'Espera chamar por websocket'
    ]});
});
app.get('/activity/:id/register/:token', (req, res) => {
    const id = req.params.id;
    const token = req.params.token;
    res.layout('register', {id, token});
});
app.post('/activity/:id/register/:token', (req, res) => {
    const id = req.params.id;
    res.layout('registration-pending', {id, reasons: {
        '/payment/1': 'Pagamento taxa inscrição',
        '/payment/2': 'Pagamento taxa conveniência',
        '/age-confirmation': 'Verificação de idade'
    }});
});
app.post('/external/payment/:id', (req, res) => {
    const id = req.params.id;
    res.layout('redirect', {urls: [
        `/payment/${id}/confirm`,
        `/payment/${id}/deny`,
        `/payment/${id}/expired`
    ]});
});
app.get('/payment/:id/confirm', (req, res) => {
    const id = req.params.id;
    res.layout('redirect', {url: `/registration/1`, stages: [
        'Confirma reserva de lugar'
    ]});
});
app.get('/payment/:id/deny', (req, res) => {
    const id = req.params.id;
    res.layout('redirect', {url: `/payment/${id}?error=Payment denied`});
});
app.get('/payment/:id/expired', (req, res) => {
    const id = req.params.id;
    res.layout('redirect', {url: `/`, stages: [
        'Cancela reserva de lugar'
    ]});
});
app.get('/payment/:id', (req, res) => {
    const id = req.params.id;
    const error = req.query.error;
    res.layout('payment', {id, error});
});
app.get('/registration/:id', (req, res) => {
    const id = req.params.id;
    res.layout('registration-sucess', {id});
});

// await messageBus.consume("front");

app.listen(port, () => {
    console.log(`Front listening on port http://localhost:${port}`);
    app.router.stack.filter(x => x.route != null)
        .map(l => `${Object.keys(l.route.methods)} - http://localhost:${port}${l.route.path}`)
        .forEach(r => console.log(r))
})

