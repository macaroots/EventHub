// Token emitido pelo identity ({userId, name}) e verificado por cada serviço com o mesmo segredo (HS256).
// Sem role: quem gerencia um evento é decidido pelo vínculo do userId com o evento (secretaria).
import jwt from 'jsonwebtoken';

function secret() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET not set');
    return s;
}

// Só para testes e scripts: o identity é quem emite em produção.
export function sign(user, expiresIn = '1h') {
    return jwt.sign({ userId: user.id, name: user.name }, secret(), { expiresIn });
}

export function verify(token) {
    const { userId, name } = jwt.verify(token, secret());
    if (!userId) throw new Error('token without userId');
    return { id: userId, name };
}

// Middleware: exige "Authorization: Bearer <token>" e preenche req.user = {id, name}.
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
