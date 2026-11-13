import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import { BcryptHasher } from '../src/infrastructure/hasher.js';

Object.assign(process.env, {
    DATABASE_URL: 'postgresql://unused/test',
    JWT_SECRET: 'identity-payment-integration-test-secret',
    INTERNAL_API_TOKEN: 'integration-test-internal',
    LOG_LEVEL: 'silent',
});
const { pool } = await import('../src/infrastructure/db.js');
const { UserAppService } = await import('../src/application/user.app-service.js');
const { UserRepository } = await import('../src/infrastructure/user.repository.js');
const { User } = await import('../src/domain/user.js');
const { verify } = await import('../../shared/auth/jwt.js');

// Rotas /auth do src/main.js (que não exporta o app: conecta no broker ao importar).
const createApp = (service) => express().use(express.json())
    .post('/auth/register', (req, res) => service.signin(req.body).then(id => res.json({ id }), e => res.status(400).json(e.message)))
    .post('/auth/login', (req, res) => service.authenticate(req.body).then(r => res.json(r), e => res.status(400).json(e.message)));

test('cadastro e login da main produzem JWT aceito pelos servicos', async t => {
    const users = new Map();
    const events = [];
    const previousQuery = pool.query;
    const previousConnect = pool.connect;
    const query = async (sql, params = []) => {
        if (sql.includes('INSERT INTO users')) {
            const [id, name, username, email, passwordHash, active, createdAt] = params;
            users.set(id, new User(username, passwordHash, 'user', id, email));
        }
        if (sql.includes('SELECT * FROM users')) {
            const key = sql.includes('lower(username)') ? 'username' : sql.includes('lower(email)') ? 'email' : 'id';
            return { rows: [...users.values()].filter(user => [user[key], user.email].some(v => String(v).toLowerCase() === params[0].toLowerCase())).map(user => ({
                id: user.id, name: user.name, username: user.username, email: user.email,
                password_hash: user.password, active: user.active, created_at: user.createdAt,
            })) };
        }
        return { rows: [] };
    };
    pool.query = query;
    pool.connect = async () => ({ query, release() {} });
    t.after(() => { pool.query = previousQuery; pool.connect = previousConnect; });
    const service = new UserAppService(new UserRepository(), { publish: e => events.push(e) }, new BcryptHasher());
    const identity = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => identity.once('listening', resolve));
    t.after(() => new Promise(resolve => identity.close(resolve)));
    process.env.IDENTITY_URL = `http://127.0.0.1:${identity.address().port}`;
    const { router } = await import('../../web/src/routes/auth.js');
    const frontend = express();
    frontend.use(express.urlencoded({ extended: false }));
    frontend.use((req, res, next) => { res.layout = (view, data) => res.json({ view, ...data }); next(); });
    frontend.use('/auth', router);

    // Campos do formulario atual; o cadastro ja entra logado.
    await request(frontend).post('/auth/register').type('form').send({
        username: 'ana', email: 'ana@example.com', password: 'Senha@1234',
    }).expect(302).expect('Location', '/organizers/events');
    const user = [...users.values()][0];
    assert.notEqual(user.password, 'Senha@1234');
    assert.equal(events[0].type, 'UserRegistered');
    assert.equal(events[0].userId, user.id);
    assert.equal(events[0].email, 'ana@example.com');
    assert.equal(JSON.stringify(user).includes('password'), false);

    const response = await request(frontend).post('/auth/login').type('form').send({
        username: 'ANA@example.com', password: 'Senha@1234', next: '/events/evento-especifico',
    }).expect(302).expect('Location', '/events/evento-especifico');
    const cookie = response.headers['set-cookie'].find(value => value.startsWith('token='));
    const token = cookie.split(';')[0].slice('token='.length);
    assert.equal(verify(token).id, user.id);
    await request(frontend).post('/auth/login').type('form').send({ username: 'ana@example.com', password: 'errada' }).expect(400);
});
