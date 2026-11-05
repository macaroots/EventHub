import { Router } from 'express';

// Protótipo do fluxo de inscrição (ainda sem chamadas aos serviços).
export const router = Router();

router.get('/activity/:id/register/', (req, res) => {
    const { id } = req.params;
    const token = crypto.randomUUID();
    res.layout('redirect', { url: `/activity/${id}/register/${token}`, stages: [
        'Entra na fila, recebe uma senha (token)',
        'Espera chamar por websocket'
    ]});
});
router.get('/activity/:id/register/:token', (req, res) => {
    const { id, token } = req.params;
    res.layout('register', { id, token });
});
router.post('/activity/:id/register/:token', (req, res) => {
    const { id } = req.params;
    res.layout('registration-pending', { id, reasons: {
        '/payment/1': 'Pagamento taxa inscrição',
        '/payment/2': 'Pagamento taxa conveniência',
        '/age-confirmation': 'Verificação de idade'
    }});
});
router.get('/registration/:id', (req, res) => {
    res.layout('registration-sucess', { id: req.params.id });
});
