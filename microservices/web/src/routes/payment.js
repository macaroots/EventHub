import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as payment from '../clients/payment.js';
import * as registration from '../clients/registration.js';
import { json } from './helpers.js';

// Pagamento da reserva da inscrição (paymentId = registration.payment.id).
export const router = Router();

// O JWT de identidade acompanha a chamada ao payment. A inscrição precisa
// estar visível ao usuário e somente o dono pode realizar o pagamento.
const load = async (req) => {
    // PaymentRequested chega por mensagem: a cobrança pode ainda estar em trânsito.
    let response;
    for (let attempt = 0; attempt < 15; attempt++) {
        response = await payment.getPayment(req, req.params.id);
        if (response.status !== 404 || attempt === 14) break;
        await response.text();
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    const p = await json(response);
    const r = await json(await registration.getRegistration(req, p.registrationId));
    return { payment: p, registration: r };
};

// PaymentConfirmed/Denied chega ao registration por mensagem (assíncrono).
// Espera um pouco o resultado para não mostrar a inscrição ainda pendente.
const settled = async (req, registrationId, paymentId, tries = 10) => {
    for (let i = 0; i < tries; i++) {
        const r = await json(await registration.getRegistration(req, registrationId));
        if (r.status != 'awaiting_payment' || r.payment?.id != paymentId) return;
        await new Promise(ok => setTimeout(ok, 200));
    }
};

router.get('/payments', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const payments = await json(await payment.listPayments(req));
        const registrations = await json(await registration.listRegistrations(req));
        const own = new Map(registrations.filter(r => r.userId === req.user.sub).map(r => [r.id, r]));
        res.layout('payments/list', { payments: payments.filter(p => p.userId === req.user.sub && own.has(p.registrationId)).map(p => ({ ...p, registration: own.get(p.registrationId) })), paymentsError: null });
    } catch (error) {
        console.error('Não foi possível carregar os pagamentos:', error.message);
        res.status(503).layout('payments/list', { payments: [], paymentsError: 'Não foi possível carregar seus pagamentos. Tente novamente em instantes.' });
    }
});
router.get('/payments/:id', authenticate, async (req, res) => {
    const data = await load(req);
    if (data.registration.userId !== req.user.sub) return res.sendStatus(403);
    res.layout('payments/show', { ...data, method: req.query.method === 'card' ? 'card' : 'pix' });
});
router.get('/payments/:id/status.json', authenticate, async (req, res) => {
    const { payment: p, registration: r } = await load(req);
    if (r.userId != req.user.sub) return res.sendStatus(403);
    res.set('Cache-Control', 'no-store').json({ status: p.status, registrationStatus: r.status });
});
router.post('/payments/:id/cancel', authenticate, async (req, res) => {
    const { payment: p, registration: r } = await load(req);
    if (r.userId !== req.user.sub) return res.sendStatus(403);
    if (p.status !== 'pending' || r.status !== 'awaiting_payment') return res.redirect(`/payments/${encodeURIComponent(p.id)}`);
    const response = await registration.cancelRegistration(req, r.id);
    if (!response.ok) return res.redirect(`/payments/${encodeURIComponent(p.id)}?error=${encodeURIComponent('Não foi possível cancelar a compra. Tente novamente.')}`);
    await settled(req, r.id, p.id);
    res.redirect(`/payments/${encodeURIComponent(p.id)}`);
});
router.post('/payments/:id', authenticate, async (req, res) => {
    const { payment: p, registration: r } = await load(req);
    if (r.userId != req.user.sub) throw Object.assign(new Error('Not allowed to pay'), { status: 403 });
    const outcome = req.body.outcome;
    const method = req.body.method;
    if (!['pix', 'card'].includes(method)) return res.status(400).send('Método de pagamento inválido');
    if (!['success', 'denied'].includes(outcome)) return res.status(400).send('Simulação inválida');
    if (p.status !== 'pending' || r.status !== 'awaiting_payment') return res.redirect(`/payments/${encodeURIComponent(p.id)}`);
    const response = await payment.pay(req, p.id, method === 'pix' ? 'PIX-DEMO' : 'CARTAO-DEMO', outcome);
    if (!response.ok) {
        return res.redirect(`/payments/${encodeURIComponent(p.id)}?error=${encodeURIComponent(await response.text())}`);
    }
    await settled(req, p.registrationId, p.id);
    res.redirect(`/payments/${encodeURIComponent(p.id)}`);
});
