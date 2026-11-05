// res.layout(view, data): renderiza a view dentro de layout.ejs.
export const layout = (req, res, next) => {
    res.layout = (view, data = {}, layout = 'layout') =>
        res.render(view, data, (err, body) =>
            err ? next(err) : res.render(layout, { ...data, body }));
    next();
};
