import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as certificate from '../clients/certificate.js';
import * as registration from '../clients/registration.js';

export const router = Router();

const serviceError = status => Object.assign(new Error({
    401: 'Sua sessão expirou. Entre novamente.',
    403: 'Você não tem permissão para acessar este certificado.',
    404: 'O certificado ainda não está disponível. Aguarde o encerramento do evento e a emissão para os participantes com presença registrada.',
}[status] || 'Não foi possível acessar o serviço de certificados. Tente novamente.'), { status });

async function checked(response) {
    if (!response.ok) throw serviceError(response.status);
    return response;
}

const errorMessage = error => error.status ? error.message : 'Não foi possível conectar ao serviço de certificados. Tente novamente.';
const redirectError = (res, back, error) => res.redirect(`${back}?error=${encodeURIComponent(errorMessage(error))}`);

async function download(req, res, id) {
    const response = await checked(await certificate.downloadCertificate(req, id));
    const content = Buffer.from(await response.arrayBuffer());
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', 'attachment; filename="certificado.pdf"');
    res.send(content);
}

router.get('/certificates', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const response = await checked(await certificate.listCertificates(req));
        res.layout('certificates/list', { certificates: await response.json(), certificateError: null });
    } catch (error) {
        res.status(error.status || 502).layout('certificates/list', { certificates: [], certificateError: errorMessage(error) });
    }
});

router.get('/certificates/:id/download', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        await download(req, res, req.params.id);
    } catch (error) { redirectError(res, '/certificates', error); }
});

router.post('/registrations/:id/certificate', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const back = `/registrations/${encodeURIComponent(req.params.id)}`;
    try {
        const response = await registration.getRegistration(req, req.params.id);
        if (!response.ok) throw Object.assign(new Error('Não foi possível consultar sua inscrição.'), { status: response.status });
        const item = await response.json();
        // Organizadores podem consultar inscrições de terceiros, mas este botão é pessoal.
        if (item.userId !== req.user.sub) throw serviceError(403);
        const eventId = item.event?.id;
        if (!eventId) throw serviceError(404);
        const result = await checked(await certificate.findForEvent(req, eventId));
        const { certificateId } = await result.json();
        if (!certificateId) throw serviceError(502);
        await download(req, res, certificateId);
    } catch (error) { redirectError(res, back, error); }
});
