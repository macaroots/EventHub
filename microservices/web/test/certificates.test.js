import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
import { router } from '../src/routes/certificates.js';

test('certificate routes list personal certificates, download PDF, enforce ownership and handle unavailable certificates', async () => {
    process.env.JWT_SECRET = 'certificate-test-secret';
    const token = jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET);
    const app = express();
    app.use(cookieParser());
    app.use((req, res, next) => { res.layout = (view, data) => res.json({ view, ...data }); next(); });
    app.use(router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const realFetch = globalThis.fetch;
    const calls = [];
    let owner = 'user-1';
    let available = true;
    let offline = false;
    let forbidden = false;
    const pdf = Buffer.from('%PDF-1.4\ncertificate example');
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        if (offline) throw new Error('offline');
        if (url.endsWith('/registrations/reg-1')) return Response.json({ userId: owner, event: { id: 'event-1' } });
        if (url.endsWith('/events/event-1/certificates')) return available ? Response.json({ certificateId: 'cert-1' }) : new Response('', { status: 404 });
        if (url.endsWith('/download')) return forbidden ? new Response('', { status: 403 }) : new Response(pdf);
        return Response.json([{ certificateId: 'cert-1', eventName: 'Evento', eventDate: '2026-11-12' }]);
    };
    const request = (path, method = 'GET', authenticated = true) => realFetch(base + path, {
        method, redirect: 'manual', headers: authenticated ? { Cookie: `token=${token}` } : {},
    });
    try {
        let response = await request('/certificates');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal((await response.json()).certificates[0].certificateId, 'cert-1');
        assert.equal(calls.at(-1).options.headers.authorization, `Bearer ${token}`);

        response = await request('/registrations/reg-1/certificate', 'POST');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'application/pdf');
        assert.match(response.headers.get('content-disposition'), /attachment; filename="certificado.pdf"/);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
        assert.equal(calls.at(-2).options.method, 'POST');

        owner = 'someone-else';
        const before = calls.length;
        response = await request('/registrations/reg-1/certificate', 'POST');
        assert.equal(response.status, 302);
        assert.match(decodeURIComponent(response.headers.get('location')), /permissão/);
        assert.equal(calls.length, before + 1, 'must reject before contacting certificate service');

        owner = 'user-1';
        available = false;
        response = await request('/registrations/reg-1/certificate', 'POST');
        assert.equal(response.status, 302);
        assert.match(decodeURIComponent(response.headers.get('location')), /ainda não está disponível/);
        assert.equal(response.headers.get('content-disposition'), null);

        forbidden = true;
        response = await request('/certificates/other-certificate/download');
        assert.equal(response.status, 302);
        assert.match(response.headers.get('location'), /^\/certificates\?error=/);
        offline = true;
        response = await request('/certificates');
        assert.equal(response.status, 502);
        assert.match((await response.json()).certificateError, /conectar/);
        response = await request('/certificates', 'GET', false);
        assert.equal(response.status, 302);
        assert.match(response.headers.get('location'), /^\/auth\/login/);
    } finally {
        globalThis.fetch = realFetch;
        await new Promise(resolve => server.close(resolve));
    }
});

test('certificate views render empty, error and populated states and show registration action only to its owner', async () => {
    const list = new URL('../src/views/certificates/list.ejs', import.meta.url);
    for (const data of [
        { certificates: [], certificateError: null },
        { certificates: [], certificateError: 'Serviço indisponível' },
        { certificates: [{ certificateId: 'cert-1', eventName: '<Evento>', eventDate: '2026-11-12' }], certificateError: null },
    ]) {
        const html = await ejs.renderFile(fileURLToPath(list), data);
        assert.match(html, /Meus certificados/);
        if (data.certificates.length) { assert.match(html, /12\/11\/2026/); assert.match(html, /&lt;Evento&gt;/); }
    }
    const view = new URL('../src/views/registrations/show.ejs', import.meta.url);
    const data = { registration: { id: 'reg-1', userId: 'user-1', status: 'confirmed', requirements: [], event: { id: 'event-1', name: 'Evento', status: 'ended' } }, user: { sub: 'user-1' } };
    assert.match(await ejs.renderFile(fileURLToPath(view), data), /Gerar certificado/);
    assert.doesNotMatch(await ejs.renderFile(fileURLToPath(view), { ...data, user: { sub: 'other' } }), /Gerar certificado/);
});
