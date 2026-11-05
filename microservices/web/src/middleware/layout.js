import { currentUser } from './authenticate.js';

// res.layout(view, data): renderiza a view dentro de layout.ejs.
// ?error= (das ações com redirect) e o usuário logado (ou null) ficam disponíveis para as views.
export const layout = (req, res, next) => {
    res.locals.error = req.query.error;
    res.locals.user = currentUser(req);
    res.layout = (view, data = {}, layout = 'layout') =>
        res.render(view, data, (err, body) =>
            err ? next(err) : res.render(layout, { ...data, body }));
    next();
};
