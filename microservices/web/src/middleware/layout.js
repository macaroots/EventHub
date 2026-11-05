// res.layout(view, data): renderiza a view dentro de layout.ejs.
// ?error= (das ações com redirect) fica disponível para o layout.
export const layout = (req, res, next) => {
    res.locals.error = req.query.error;
    res.layout = (view, data = {}, layout = 'layout') =>
        res.render(view, data, (err, body) =>
            err ? next(err) : res.render(layout, { ...data, body }));
    next();
};
