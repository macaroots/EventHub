import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { api } from '../clients/http.js';
import { json } from './helpers.js';
import * as registration from '../clients/registration.js';
import * as payment from '../clients/payment.js';
import { pendingPurchaseNotifications } from '../notifications/pending.js';
const call = api(process.env.NOTIFICATION_URL || 'http://notification:3006');
export const router = Router();
router.get('/notifications', authenticate, async (req, res) => {
    try {
        await call('/contacts/me', req, { method: 'PUT' });
        const filter = String(req.query.type || '');
        const registrationId = typeof req.query.registrationId === 'string' ? req.query.registrationId : '';
        const query = new URLSearchParams({ limit: '100' });
        if (registrationId) query.set('registrationId', registrationId);
        const data = await json(await call(`/notifications?${query}`, req));
        let items = data.items.filter(item => (!filter || item.event_type === filter) && (!registrationId || item.registration_id === registrationId));
        if (filter === 'PaymentRequested') {
            const [registrations, payments] = await Promise.all([
                registration.listRegistrations(req).then(json), payment.listPayments(req).then(json),
            ]);
            items = pendingPurchaseNotifications(items, registrations, payments, req.user.sub);
        }
        res.layout('notifications/index', { notifications: items, filter, registrationId });
    } catch (err) {
        console.error('Notificações indisponíveis:', err.message);
        res.status(503).layout('notifications/index', { notifications: [], filter: '', registrationId: '', notificationError: true });
    }
});
