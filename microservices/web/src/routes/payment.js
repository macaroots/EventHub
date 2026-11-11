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

router.get('/payments/:id', authenticate, async (req, res) => {
    res.layout('payments/show', await load(req));
});
router.post('/payments/:id', authenticate, async (req, res) => {
    const { payment: p, registration: r } = await load(req);
    if (r.userId != req.user.sub) throw Object.assign(new Error('Not allowed to pay'), { status: 403 });
    const response = await payment.pay(req, p.id, req.body.receipt);
    if (!response.ok) {
        return res.redirect(`/payments/${encodeURIComponent(p.id)}?error=${encodeURIComponent(await response.text())}`);
    }
    await settled(req, p.registrationId, p.id);
    res.redirect(`/registrations/${encodeURIComponent(p.registrationId)}`);
});
