import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as secretariat from '../clients/secretariat.js';

export const router = Router();
router.use(authenticate);

router.get('/events', async (req, res) => {
    const response = await secretariat.listEvents(req);
    const error = response.ok ? null : await response.text();
    const events = response.ok ? await response.json() : [];
    res.layout('organizers/events', { events, error });
});

router.post('/events', async (req, res) => {
    const response = await secretariat.createEvent(req, req.body);
    if (!response.ok) {
        return res.status(response.status).layout('organizers/events', { events: [], error: await response.text() });
    }
    res.redirect('/organizers/events'); // Post/Redirect/Get
});
