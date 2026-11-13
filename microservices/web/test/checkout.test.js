import assert from 'node:assert/strict';
import { test } from 'node:test';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
const view = fileURLToPath(new URL('../src/views/payments/show.ejs', import.meta.url));
const registration = { id:'reg-1', userId:'u1', status:'awaiting_payment', reasons:[], event:{ id:'event-1', name:'Evento' }, activity:{ name:'Oficina' } };
const pending = { id:'pay-1', amount:25, status:'pending', expiresAt:'2030-01-01T00:00:00Z' };
const render = (payment, method='pix', reg=registration) => ejs.renderFile(view, { payment, registration:reg, method });
test('checkout supports both simulated methods, denial and the actual deadline', async () => {
    const html = await render(pending);
    assert.match(html, /2030-01-01T00:00:00Z/);
    assert.match(html, /Não envie dinheiro/);
    assert.match(html, /Simular compra negada/);
    assert.match(html, /value="success"/);
    assert.match(html, /value="denied"/);
    assert.match(html, /PIX simulado/); assert.match(html, /Cartão simulado/);
    assert.match(html, /name="method" value="pix"/);
    assert.match(await render(pending, 'card'), /name="method" value="card"/);
});
test('checkout represents approved, processing and expired payments accurately', async () => {
    const paid = { ...pending, status:'paid' };
    assert.match(await render(paid, 'pix', {...registration,status:'confirmed'}), /Inscrição confirmada/);
    assert.match(await render(paid), /Aguardando confirmação da inscrição/);
    const expired = await render({...pending,status:'expired'}, 'pix', {...registration,status:'canceled'});
    assert.match(expired, /cancelada por tempo expirado/); assert.doesNotMatch(expired, /Simular compra negada/);
    const denied = await render({...pending,status:'denied'}, 'pix', {...registration,status:'canceled'});
    assert.match(denied, /saldo insuficiente/i);
});

