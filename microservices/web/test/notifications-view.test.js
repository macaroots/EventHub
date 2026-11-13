import { test } from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { fileURLToPath } from 'node:url';
const view = fileURLToPath(new URL('../src/views/notifications/index.ejs', import.meta.url));
test('notification message opens in an accessible details element', async () => {
 const html = await ejs.renderFile(view, { registrationId:'', filter:'', notifications:[{event_type:'PaymentDenied',subject:'Compra negada',body:'Saldo insuficiente',status:'sent',created_at:1700000000,registration_id:'r1'}] });
 assert.match(html, /<details class="notif-card/); assert.match(html, /<summary class="notif-summary"/);
 assert.match(html, /Ver mensagem/); assert.match(html, /Saldo insuficiente/);
});

test('all notification types use consistent cards and highlight only a valid check-in code', async () => {
 const kinds = ['PaymentRequested','PaymentConfirmed','PaymentDenied','PaymentExpired','PaymentCanceled','RegistrationCreated','RegistrationConfirmed','RegistrationCanceled','EventCanceledNotice','CheckInOpened','FutureKind'];
 const notifications = kinds.map((event_type, index) => ({event_type, subject: `Aviso ${index}`, body: event_type === 'CheckInOpened' ? 'Seu código é: ABC234. Referência: <segura>.' : `Texto ${index}`, status:'sent', created_at:1700000000, registration_id:'r1'}));
 const html = await ejs.renderFile(view, { registrationId:'', filter:'', notifications });
 assert.equal((html.match(/<details class="notif-card/g) || []).length, kinds.length);
 assert.equal((html.match(/<summary class="notif-summary"/g) || []).length, kinds.length);
 assert.match(html, /<mark class="notif-checkin-code">ABC234<\/mark>/);
 assert.match(html, /&lt;segura&gt;/);
 assert.match(html, /Ver inscrição/);
});

test('empty, filtered and error states remain available', async () => {
 const base = { registrationId:'r1', filter:'PaymentDenied', notifications:[] };
 const html = await ejs.renderFile(view, base);
 assert.match(html, /Nenhuma mensagem encontrada/);
 assert.match(html, /name="registrationId" value="r1"/);
 assert.match(html, /value="PaymentDenied" selected/);
 assert.match(await ejs.renderFile(view, {...base, notificationError:true}), /Não foi possível carregar/);
});
