import jwt from 'jsonwebtoken';

// Usuário do cookie ({sub, name}), ou null se não logado / token inválido.
// O JWT do identity traz só {userId}; o nome vem do cookie `name`, gravado no login.
export const currentUser = (req) => {
    try {
        const { userId } = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        return userId ? { sub: userId, name: req.cookies.name } : null;
    } catch {
        return null;
    }
};

// Páginas SSR: sem token válido, redireciona para o login e volta depois (?next=).
// Em POST volta para a página de origem (Referer), já que o POST não pode ser repetido por GET.
export const authenticate = (req, res, next) => {
    req.user = currentUser(req);
    if (req.user) return next();
    res.clearCookie('token');
    const back = req.method == 'GET' ? req.originalUrl : new URL(req.get('referer') ?? '/', 'http://x').pathname;
    res.redirect(`/auth/login?next=${encodeURIComponent(back)}`);
};
