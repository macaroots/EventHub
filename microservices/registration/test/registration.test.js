import assert from "node:assert/strict";
import { test } from "node:test";
import { Activity, MinimumAgeRule } from "../src/domain/activity.js";

const types = (registration) => registration.pullMessages().map(m => m.type);

test("should register", async () => {
  const activity = new Activity({ capacity: 1 });
  const registration = activity.register(1);

  assert.equal(activity.getOccupation(), 1);
  assert.equal(activity.getConfirmedOccupation(), 1);
  assert.equal(registration.status, 'confirmed');
  assert.deepEqual(types(registration), ['RegistrationCreated', 'RegistrationConfirmed']);
});
test("should not register twice", async () => {
  const activity = new Activity({ capacity: 1 });
  activity.register(1);
  assert.throws(() => activity.register(1), /Duplicated user/);
});
test("should allow registering again after cancel", async () => {
  const activity = new Activity({ capacity: 1 });
  activity.register(1).cancel('desisti');
  assert.equal(activity.register(1).status, 'confirmed');
});
test("should not exceed capacity", async () => {
  const activity = new Activity({ capacity: 1 });
  const registration = activity.register(1);
  const registration2 = activity.register(2);
  assert.equal(activity.getOccupation(), 1);
  assert.equal(registration.status, 'confirmed');
  assert.equal(registration2.status, 'canceled');
  assert.equal(registration2.getReasons()[0], 'Full occupation');
});
test("denied registration must not request payment", async () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  activity.register(1); // ocupa a vaga, pendente de pagamento
  activity.registrations[0].fulfill(activity.registrations[0].requirements[0].id);
  const denied = activity.register(2);
  assert.equal(denied.status, 'canceled');
  assert.deepEqual(types(denied), ['RegistrationCreated']);
});
test("should send overflow to wait list if full occupation is not confirmed", async () => {
  const activity = new Activity({ capacity: 1, price: 10 });
  const registration = activity.register(1);
  const registration2 = activity.register(2);
  assert.equal(activity.getOccupation(), 2);
  assert.equal(registration.status, 'pending');
  assert.equal(registration2.status, 'pending');
  assert.equal(registration2.getPendingRequirements()[0].type, 'wait list');
});
test("should wait for payment + age verification", async () => {
  const activity = new Activity({ capacity: 1, price: 50, rules: [new MinimumAgeRule(18)] });
  const registration = activity.register(1);
  assert.equal(registration.status, 'pending');
  assert.equal(activity.getConfirmedOccupation(), 0);
  assert.deepEqual(registration.getPendingRequirements().map(r => r.type), ['age verification', 'payment']);
  const messages = registration.pullMessages();
  assert.deepEqual(messages.filter(m => m.type == 'PaymentRequested').map(m => m.amount), [50]);

  for (const r of registration.requirements) registration.fulfill(r.id);
  assert.equal(registration.status, 'confirmed');
  assert.deepEqual(types(registration), ['RegistrationConfirmed']);
});
test("should not reduce capacity below confirmed occupation", async () => {
  const activity = new Activity({ capacity: 2 });
  activity.register(1);
  activity.register(2);
  assert.throws(() => activity.setCapacity(1), /confirmed occupation/);
});
