import jwt from 'jsonwebtoken';

// Usuário do JWT do cookie, ou null se não logado / token inválido.
export const currentUser = (req) => {
    try {
        const { userId, name, username, email } = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
        const looksLikeId = value => typeof value === 'string' && (value === userId || /^[0-9a-f]{24,64}$/i.test(value) || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value));
        const displayName = [name, username].find(value => typeof value === 'string' && value.trim() && !looksLikeId(value.trim())) || (typeof email === 'string' && email.includes('@') ? email.split('@')[0] : 'Usuário');
        return userId ? { sub: userId, name: displayName, username: looksLikeId(username) ? undefined : username, email } : null;
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
