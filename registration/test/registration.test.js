import assert from "node:assert/strict";
import { test } from "node:test";
import { Activity, PaymentRule, Registration, User } from "../src/domain/activity.js";

test("should register", async () => {
  const user = new User(1);
  const activity = new Activity(1, undefined, 1)
  const registration = new Registration(user, activity);
  activity.register(registration);

  assert.equal(activity.getOccupation(), 1);
  assert.equal(activity.getConfirmedOccupation(), 1);
  assert.equal(registration.status, 'confirmed');
});
test("should not register twice", async () => {
  const user = new User(1);
  const activity = new Activity(1, undefined, 1)
  const registration = new Registration(user, activity);
  activity.register(registration);
  assert.throws(() => activity.register(registration), /Duplicated user/);
});
test("should not exceed capacity", async () => {
  const user = new User(1);
  const user2 = new User(2);
  const activity = new Activity(1, undefined, 1)
  const registration = new Registration(user, activity);
  const registration2 = new Registration(user2, activity);
  activity.register(registration);
  activity.register(registration2);
  assert.equal(activity.getOccupation(), 1);
  assert.equal(registration.status, 'confirmed');
  assert.equal(registration2.status, 'canceled');
  assert.equal(registration2.getReasons()[0], 'Full occupation');
});
test("should send overflow to wait list if full occupation is not confirmed", async () => {
  const user = new User(1);
  const user2 = new User(2);
  const activity = new Activity(1, [new PaymentRule(10)], 1)
  const registration = new Registration(user, activity);
  const registration2 = new Registration(user2, activity);
  activity.register(registration);
  activity.register(registration2);
  assert.equal(activity.getOccupation(), 2);
  assert.equal(registration.status, 'pending');
  assert.equal(registration2.status, 'pending');
  assert.equal(registration2.getReasons()[0].type, 'wait list');
  
});
test("should wait for payment", async () => {
  const user = new User(1);
  const activity = new Activity(1, [new PaymentRule(10)], 1);
  const registration = new Registration(user, activity);
  activity.register(registration);
  assert.equal(registration.status, 'pending');
  assert.equal(activity.getOccupation(), 1);
  assert.equal(activity.getConfirmedOccupation(), 0);
  const reason = registration.getReasons()[0];
  assert.equal(reason.type, 'payment');
});
