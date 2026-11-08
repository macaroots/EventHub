// Token emitido pelo identity e verificado por cada serviço com o mesmo segredo (HS256).
import jwt from 'jsonwebtoken';

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET not set');
    return s;
}

export function sign(user) {
    return jwt.sign({ sub: user.id, username: user.username, role: user.role }, secret(), { expiresIn: '8h' });
}

export function verify(token) {
    const { sub, username, role } = jwt.verify(token, secret());
    return { id: sub, username, role };
}

// Middleware: exige "Authorization: Bearer <token>" e preenche req.user = {id, username, role}.
export function authenticate() {
    secret(); // falha na subida, não na primeira requisição
    return (req, res, next) => {
        const [scheme, token] = (req.headers.authorization ?? '').split(' ');
        try {
            if (scheme != 'Bearer') throw new Error();
            req.user = verify(token);
            next();
        } catch {
            res.status(401).send('Unauthorized');
        }
    };
}
