import express from 'express';
import { RabbitMqMessageBus } from '../../shared/messaging/rabbitmq-message-bus.js';
import path from 'path';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const app = express()
const port = process.env.PORT || 3000;

app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.set('view engine', 'ejs');
app.set('views', import.meta.dirname + '/views');
app.use(express.static(path.join(import.meta.dirname, 'public')));

// const messageBus = await RabbitMqMessageBus.connect();

// // messageBus.listen('WaitingPayment', e => paymentService.charge(e.paymentId, e.amout));

app.use((req, res, next) => {
    res.layout = (view, data = {}, layout = 'layout') =>
        res.render(view, data, (err, body) =>
            err ? next(err) : res.render(layout, { ...data, body }));

    next();
})

const authenticate = (req, res, next) => {
  // Extract token directly from the parsed cookies object
  const token = req.cookies.token;
console.log(req.cookies, 'cooki', process.env.JWT_SECRET, 'k');

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
console.log({verified});

    req.user = verified; // Pass decoded token payload to the request object
    next();
  } catch (error) {
    console.log({error});
    
    return res.status(403).json({ message: 'Invalid or expired token.', error });
  }
};

app.get('/', (req, res) => {
    res.layout('index');
});
app.get('/auth/register', (req, res) => {
    res.layout('auth/register');
});
app.get('/auth/login', (req, res) => {
    res.layout('auth/login');
});
app.post('/auth/login', async (req, res) => {    
    const response = await ApiGateway.login(req);
    if (response.status == 200) {
        const {user, token} = await response.json();
        res.cookie('token', token, {
            httpOnly: true,                        // Prevents client-side JS read access (XSS defense)
            secure: process.env.NODE_ENV === 'production', // Only sends over HTTPS in production
            sameSite: 'strict',                    // Mitigates CSRF attacks
            maxAge: 3600000                        // Cookie expiry: 1 hour in milliseconds
        });
        res.redirect('/organizers/events')
    } else {
        res.status(400).send(await response.text());
    }
});

app.get('/organizers/events', authenticate, async (req, res) => {
    const response = await ApiGateway.listEvents(req);
    let events;
    if (response.status == 200) {
        events = await response.json();
    } else {
        events = [{name: await response.text()}];
    }
    console.log({events});
    
    res.layout('organizers/events', {events});
});
app.post('/organizers/events', authenticate, async (req, res) => {
    const response = await ApiGateway.createEvent(req);
    let events;
    if (response.status == 200) {
        events = await response.json();
    } else {
        events = [{name: await response.text()}];
    }
    console.log({events});
    
    // res.layout('organizers/events', {events});
    res.json({events});
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

class ApiGateway {
    static SECRETARIAT_URL = 'http://secretariat:3002';
    static IDENTITY_URL = 'http://identity:3003';
    static login(req) {
        return fetch(`${this.IDENTITY_URL}/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
    }
    static listEvents(req) {
        return fetch(`${this.SECRETARIAT_URL}/events`, {
            headers: {
                'authorization': 'Bearer ' + req.cookies.token
            }
        });
    }
    static createEvent(req) {
        return fetch(`${this.SECRETARIAT_URL}/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'authorization': 'Bearer ' + req.cookies.token
            },
            body: JSON.stringify(req.body)
        });
    }
}

