import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingPurchaseNotifications } from '../src/notifications/pending.js';
test('pending filter excludes purchases paid, expired, canceled and belonging to another account', () => {
 const ids = ['pending','paid','expired','canceled','other'];
 const items = ids.map(registration_id => ({ registration_id, event_type:'PaymentRequested' }));
 const registrations = ids.map(id => ({ id, userId:id === 'other' ? 'u2' : 'u1', status:['paid','expired','canceled'].includes(id) ? 'canceled' : 'awaiting_payment' }));
 const payments = ids.map(registrationId => ({ registrationId, userId:registrationId === 'other' ? 'u2' : 'u1', status:registrationId === 'pending' || registrationId === 'other' ? 'pending' : registrationId }));
 assert.deepEqual(pendingPurchaseNotifications(items, registrations, payments, 'u1').map(i => i.registration_id), ['pending']);
});
