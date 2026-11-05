import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { layout } from './middleware/layout.js';
import { router as auth } from './routes/auth.js';
import { router as organizers } from './routes/organizers.js';
import { router as registration } from './routes/registration.js';
import { router as payment } from './routes/payment.js';

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(layout);

app.get('/', (req, res) => res.layout('index'));
app.use('/auth', auth);
app.use('/organizers', organizers);
app.use(registration);
app.use(payment);

app.listen(port, () => console.log(`Front listening on http://localhost:${port}`));
