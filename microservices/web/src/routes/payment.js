import { Router } from 'express';

// Protótipo do fluxo de pagamento (gateway externo simulado).
export const router = Router();

router.post('/external/payment/:id', (req, res) => {
    const { id } = req.params;
    res.layout('redirect', { urls: [
        `/payment/${id}/confirm`,
        `/payment/${id}/deny`,
        `/payment/${id}/expired`
    ]});
});
router.get('/payment/:id/confirm', (req, res) => {
    res.layout('redirect', { url: `/registration/1`, stages: [
        'Confirma reserva de lugar'
    ]});
});
router.get('/payment/:id/deny', (req, res) => {
    res.layout('redirect', { url: `/payment/${req.params.id}?error=Payment denied` });
});
router.get('/payment/:id/expired', (req, res) => {
    res.layout('redirect', { url: `/`, stages: [
        'Cancela reserva de lugar'
    ]});
});
router.get('/payment/:id', (req, res) => {
    res.layout('payment', { id: req.params.id, error: req.query.error });
});
