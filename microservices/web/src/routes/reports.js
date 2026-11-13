import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as reports from '../clients/reports.js';

export const router = Router();
router.use(authenticate);

const messages = {
    401: 'Sua sessão expirou. Entre novamente.',
    403: 'Você não tem permissão para consultar os relatórios deste evento.',
    404: 'O relatório ainda não está disponível. Aguarde a sincronização dos dados e tente novamente.',
    413: 'O relatório excede o limite de linhas permitido para exportação.',
};

const handle = (call, download = false) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const response = await call(req, req.params.id);
        if (!response.ok) {
            return res.status(response.status).json({ error: messages[response.status] || 'Não foi possível carregar o relatório. Tente novamente.' });
        }
        const updatedAt = response.headers.get('x-report-updated-at');
        if (updatedAt) res.set('X-Report-Updated-At', updatedAt);
        if (!download) return res.json(await response.json());
        const content = Buffer.from(await response.arrayBuffer());
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.set('Content-Disposition', 'attachment; filename="relatorio.xlsx"');
        return res.send(content);
    } catch (error) {
        console.error('Reports request failed:', error.message);
        return res.status(502).json({ error: 'Não foi possível conectar ao serviço de relatórios. Tente novamente.' });
    }
};

router.get('/events/:id/reports', handle(reports.getEvent));
router.get('/events/:id/reports/participants', handle(reports.getParticipants));
router.get('/events/:id/reports/download', handle(reports.downloadEvent, true));
