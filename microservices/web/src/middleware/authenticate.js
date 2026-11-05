import jwt from 'jsonwebtoken';

// Páginas SSR: sem token válido, redireciona para o login.
export const authenticate = (req, res, next) => {
    try {
        req.user = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('token');
        res.redirect('/auth/login');
    }
};
