import assert from "node:assert/strict";
import { test } from "node:test";
import { Activity, MinimumAgeRule } from "../src/domain/activity.js";

const types = (registration) => registration.pullMessages().map(m => m.type);

test("should register", () => {
  const activity = new Activity({ capacity: 1 });
  const registration = activity.register(1);
  assert.equal(activity.getOccupation(), 1);
  assert.equal(registration.status, 'confirmed');
  assert.deepEqual(types(registration), ['RegistrationCreated', 'RegistrationConfirmed']);
});
test("should not register twice", () => {
  const activity = new Activity({ capacity: 1 });
  activity.register(1);
  assert.throws(() => activity.register(1), /Duplicated user/);
});
test("should allow registering again after cancel", () => {
  const activity = new Activity({ capacity: 1 });
  activity.cancel(activity.register(1).id, 'desisti');
  assert.equal(activity.register(1).status, 'confirmed');
});
test("overflow goes to wait list, without payment request", () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const first = activity.register(1);
  const second = activity.register(2);
  assert.equal(first.status, 'awaiting_payment');
  assert.equal(second.status, 'waitlisted');
  assert.equal(second.payment, null);
  assert.deepEqual(types(second), ['RegistrationCreated']);
  assert.equal(activity.getOccupation(), 1);
});
test("payment confirms the reservation", () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const r = activity.register(1);
  const [, requested] = r.pullMessages();
  assert.deepEqual([requested.type, requested.paymentId, requested.amount], ['PaymentRequested', r.payment.id, 10]);
  activity.confirmPayment(r.id, r.payment.id);
  assert.equal(r.status, 'confirmed');
  assert.deepEqual(types(r), ['RegistrationConfirmed']);
});
test("cancel promotes the first of the wait list and only then requests payment", () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const first = activity.register(1);
  const second = activity.register(2);
  const third = activity.register(3);
  types(second);
  activity.cancel(first.id, 'desisti');
  assert.equal(second.status, 'awaiting_payment');
  assert.equal(third.status, 'waitlisted');
  assert.deepEqual(types(second), ['RegistrationPromoted', 'PaymentRequested']);
});
test("denied payment frees the seat; late payment of a lost reservation is ignored", () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const first = activity.register(1);
  const second = activity.register(2);
  const paymentId = first.payment.id;
  activity.denyPayment(first.id, paymentId, 'no funds');
  assert.equal(first.status, 'canceled');
  assert.equal(second.status, 'awaiting_payment');
  activity.confirmPayment(first.id, paymentId);
  assert.equal(first.status, 'canceled');
});
test("overdue reservations expire and promote the wait list", () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const first = activity.register(1);
  const second = activity.register(2);
  assert.deepEqual(activity.expireOverdue(new Date(Date.now() - 60_000)), []);
  assert.deepEqual(activity.expireOverdue(new Date(Date.now() + 1)), [first]);
  assert.equal(first.getReasons()[0], 'Payment expired');
  assert.equal(second.status, 'awaiting_payment');
});
test("eligibility comes before payment; pending eligibility holds the seat", () => {
  const activity = new Activity({ capacity: 1, price: 50, rules: [new MinimumAgeRule(18)] });
  const r = activity.register(1);
  assert.equal(r.status, 'pending');
  assert.equal(r.payment, null);
  assert.equal(activity.register(2).status, 'waitlisted');
  activity.fulfill(r.id, r.requirements[0].id);
  assert.equal(r.status, 'awaiting_payment');
  activity.confirmPayment(r.id, r.payment.id);
  assert.equal(r.status, 'confirmed');
});
test("waitlisted can fulfill eligibility while waiting", () => {
  const activity = new Activity({ capacity: 1, rules: [new MinimumAgeRule(18)] });
  const first = activity.register(1);
  const second = activity.register(2);
  activity.fulfill(second.id, second.requirements[0].id);
  assert.equal(second.status, 'waitlisted');
  activity.cancel(first.id, 'desisti');
  assert.equal(second.status, 'confirmed');
});
test("capacity increase promotes; decrease never evicts", () => {
  const activity = new Activity({ capacity: 1 });
  activity.register(1);
  const second = activity.register(2);
  activity.setCapacity(2);
  assert.equal(second.status, 'confirmed');
  assert.throws(() => activity.setCapacity(1), /confirmed occupation/);
});
test("event cancel does not promote", () => {
  const activity = new Activity({ capacity: 1 });
  activity.register(1);
  activity.register(2);
  activity.cancelAll('event canceled');
  assert.ok(activity.registrations.every(r => r.status == 'canceled'));
});
