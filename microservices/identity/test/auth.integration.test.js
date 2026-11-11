import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { UserAppService } from '../src/application/user.app-service.js';
import { BcryptHasher } from '../src/infrastructure/hasher.js';

process.env.DATABASE_URL = 'postgresql://unused/test';
process.env.JWT_SECRET = 'identity-payment-integration-test-secret';
process.env.INTERNAL_API_TOKEN = 'integration-test-internal';
const { JwtTokenService } = await import('../src/infrastructure/token.js');
const { createApp } = await import('../src/interface/app.js');
const { verify } = await import('../../shared/auth/jwt.js');

test('cadastro pelo frontend, login por e-mail e evento para inscrições', async t => {
    const users = new Map();
    const events = [];
    const repository = {
        async transaction(fn) { return fn(this); },
        async add(user) { users.set(user.id, user); },
        async publish(type, data) { events.push({ type, data }); },
        async getByEmail(email) { return [...users.values()].find(user => user.email === email); },
        async getByUsername(username) { return [...users.values()].find(user => user.username === username); },
    };
    const service = new UserAppService(repository, new BcryptHasher(), new JwtTokenService());
    const identity = createApp(service).listen(0, '127.0.0.1');
    await new Promise(resolve => identity.once('listening', resolve));
    t.after(() => new Promise(resolve => identity.close(resolve)));
    process.env.IDENTITY_URL = `http://127.0.0.1:${identity.address().port}`;
    const { router } = await import('../../web/src/routes/auth.js');
    const frontend = express();
    frontend.use(express.urlencoded({ extended: false }), cookieParser());
    frontend.use((req, res, next) => { res.layout = (view, data) => res.json({ view, ...data }); next(); });
    frontend.use('/auth', router);

    // O formulário existente só envia nome, e-mail e senha.
    await request(frontend).post('/auth/register').type('form').send({ name: 'Ana Teste', email: 'ana@example.com', password: 'Senha@1234' }).expect(302).expect('Location', '/auth/login');
    const user = [...users.values()][0];
    assert.notEqual(user.passwordHash, 'Senha@1234');
    assert.equal(events[0].type, 'UserRegistered');
    assert.deepEqual(events[0].data, { userId: user.id, name: 'Ana Teste', username: user.username, email: user.email });
    assert.equal(JSON.stringify(user).includes('passwordHash'), false);

    const response = await request(frontend).post('/auth/login').type('form').send({ username: 'ANA@example.com', password: 'Senha@1234', next: '/events/evento-especifico' }).expect(302).expect('Location', '/events/evento-especifico');
    const cookie = response.headers['set-cookie'].find(value => value.startsWith('token='));
    const token = cookie.split(';')[0].slice('token='.length);
    assert.equal(verify(token).id, user.id);
    await request(frontend).post('/auth/login').type('form').send({ username: 'ana@example.com', password: 'errada' }).expect(400);
    await request(identity).post('/auth/login').send({ username: 'ana@example.com', password: 'Senha@1234' }).expect(200).then(response => assert.ok(response.body.token));
});
