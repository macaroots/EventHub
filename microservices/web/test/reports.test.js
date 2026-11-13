import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { router } from '../src/routes/reports.js';

test('reports integration forwards credentials, paginates, downloads binary and handles failures', async () => {
    process.env.JWT_SECRET = 'reports-test-secret';
    const token = jwt.sign({ userId: 'organizer-1' }, process.env.JWT_SECRET);
    const app = express();
    app.use(cookieParser());
    app.use('/organizers', router);
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/organizers/events/event-1/reports`;
    const realFetch = globalThis.fetch;
    let upstream;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        if (upstream instanceof Error) throw upstream;
        return upstream;
    };
    const request = (suffix = '', authenticated = true) => realFetch(base + suffix, {
        headers: authenticated ? { Cookie: `token=${token}` } : {}, redirect: 'manual',
    });
    try {
        upstream = Response.json({ totals: { capacity: 20 } });
        let response = await request();
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { totals: { capacity: 20 } });
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(calls.at(-1).url, /include=activities,payments/);
        assert.equal(calls.at(-1).options.headers.authorization, `Bearer ${token}`);

        upstream = Response.json({ items: [], page: 2, limit: 25, total: 26 });
        response = await request('/participants?page=2');
        assert.equal((await response.json()).page, 2);
        assert.match(calls.at(-1).url, /limit=25&page=2/);

        const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
        upstream = new Response(bytes, { headers: { 'X-Report-Updated-At': '2026-11-12T12:00:00Z' } });
        response = await request('/download');
        assert.equal(response.headers.get('content-disposition'), 'attachment; filename="relatorio.xlsx"');
        assert.match(response.headers.get('content-type'), /spreadsheetml/);
        assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
        assert.match(calls.at(-1).url, /include=activities,participants,payments/);

        for (const status of [403, 404, 413]) {
            upstream = new Response('service error', { status });
            response = await request('/download');
            assert.equal(response.status, status);
            assert.equal(response.headers.get('content-disposition'), null);
            assert.equal(typeof (await response.json()).error, 'string');
        }
        upstream = new Error('offline');
        response = await request();
        assert.equal(response.status, 502);
        const count = calls.length;
        response = await request('', false);
        assert.equal(response.status, 302);
        assert.match(response.headers.get('location'), /^\/auth\/login/);
        assert.equal(calls.length, count);
    } finally {
        globalThis.fetch = realFetch;
        await new Promise(resolve => server.close(resolve));
    }
});
