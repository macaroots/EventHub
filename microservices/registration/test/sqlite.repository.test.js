import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Activity, MinimumAgeRule } from "../src/domain/activity.js";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { RegistrationSqliteRepository } from "../src/infrastructure/registration.sqlite.repository.js";

const repositories = () => {
  const db = new DatabaseSync(":memory:");
  const registrations = new RegistrationSqliteRepository(db);
  return { registrations, activities: new ActivitySqliteRepository(db, registrations) };
};

test("should reload activity with its registrations and rules", () => {
  const { activities } = repositories();
  const activity = new Activity({ eventId: "e1", name: "A", capacity: 1, price: 10, rules: [new MinimumAgeRule(18)] });
  activities.add(activity);
  activity.register("u1");
  activities.update(activity);

  const loaded = activities.getById(activity.id);
  assert.equal(loaded.name, "A");
  assert.equal(loaded.getRules()[0].age, 18);
  assert.equal(loaded.getOccupation(), 1);
  assert.throws(() => loaded.register("u1"), /Duplicated user/);
  assert.equal(loaded.register("u2").getPendingRequirements()[0].type, "wait list");
});

test("restored registration keeps state and only emits new messages", () => {
  const { activities, registrations } = repositories();
  const activity = new Activity({ eventId: "e1", capacity: 1, price: 10 });
  const created = activity.register("u1");
  activities.add(activity);

  const loaded = registrations.getById(created.id);
  assert.equal(loaded.status, "pending");
  loaded.fulfill(loaded.requirements[0].id);
  registrations.update(loaded);
  assert.deepEqual(loaded.pullMessages().map(m => m.type), ["RegistrationConfirmed"]);
  assert.equal(registrations.getById(created.id).status, "confirmed");
  assert.equal(activities.getById(activity.id).getConfirmedOccupation(), 1);
});
