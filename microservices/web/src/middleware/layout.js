import { currentUser } from './authenticate.js';

// res.layout(view, data): renderiza a view dentro de layout.ejs.
// ?error= (das ações com redirect), o usuário logado (ou null) e dateTime (no fuso TIME_ZONE) ficam disponíveis para as views.
const timeZone = process.env.TIME_ZONE ?? 'America/Sao_Paulo';
export const dateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone });

export const layout = (req, res, next) => {
    res.locals.error = req.query.error;
    res.locals.dateTime = dateTime;
    res.locals.user = currentUser(req);
    res.layout = (view, data = {}, layout = 'layout') =>
        res.render(view, data, (err, body) =>
            err ? next(err) : res.render(layout, { ...data, body }));
    next();
};
