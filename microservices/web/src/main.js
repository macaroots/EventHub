import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { layout } from './middleware/layout.js';
import { router as auth } from './routes/auth.js';
import { router as events } from './routes/events.js';
import { router as activities } from './routes/activities.js';
import { router as registration } from './routes/registration.js';
import { router as organizerRegistrations } from './routes/organizer-registrations.js';
import { router as notifications } from './routes/notifications.js';
import { router as payment } from './routes/payment.js';
import { router as reports } from './routes/reports.js';
import { router as certificates } from './routes/certificates.js';

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(import.meta.dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(import.meta.dirname, 'public')));
app.use(layout);

app.use('/auth', auth);
app.use('/organizers', events, activities, organizerRegistrations, reports);
app.use(registration);
app.use(payment);
app.use(notifications);
app.use(certificates);

// Erro de serviço (ex.: 403/404 do secretariat) ou exceção: página de erro no layout.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status ?? 500).layout('error', { error: err.message });
});

app.listen(port, () => console.log(`Front listening on http://localhost:${port}`));
