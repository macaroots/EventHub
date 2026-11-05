import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Activity, MinimumAgeRule } from "../src/domain/activity.js";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { RegistrationSqliteRepository } from "../src/infrastructure/registration.sqlite.repository.js";

const repositories = (db = new DatabaseSync(":memory:")) => {
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
  assert.equal(loaded.register("u2").status, "waitlisted");
});

test("restored registration keeps state and only emits new messages", () => {
  const { activities, registrations } = repositories();
  const activity = new Activity({ eventId: "e1", capacity: 1, price: 10 });
  const created = activity.register("u1");
  activities.add(activity);

  const loaded = activities.getById(activity.id);
  const r = loaded.confirmPayment(created.id, created.payment.id);
  activities.update(loaded);
  assert.deepEqual(r.pullMessages().map(m => m.type), ["RegistrationConfirmed"]);
  assert.equal(registrations.getById(created.id).status, "confirmed");
});

test("cancel + promotion in the same save passes the database guard", () => {
  const { activities } = repositories();
  const activity = new Activity({ eventId: "e1", capacity: 1 });
  activity.register("u1");
  const second = activity.register("u2");
  activities.add(activity);
  const loaded = activities.getById(activity.id);
  loaded.cancel(loaded.registrations.find(r => r.userId == "u1").id, "desisti");
  activities.update(loaded);
  assert.equal(activities.getById(activity.id).registrations.find(r => r.id == second.id).status, "confirmed");
});

test("stale activity is rejected (optimistic lock)", () => {
  const file = join(mkdtempSync(join(tmpdir(), "registration-")), "db.sqlite");
  const a = repositories(new DatabaseSync(file));
  const b = repositories(new DatabaseSync(file)); // outra conexão, como outra instância
  a.activities.add(new Activity({ id: "x", eventId: "e1", capacity: 1 }));
  const loadedA = a.activities.getById("x");
  const loadedB = b.activities.getById("x");
  loadedA.register("u1");
  a.activities.update(loadedA);
  loadedB.register("u2"); // B ainda vê a vaga livre
  assert.throws(() => b.activities.update(loadedB), /changed concurrently/);
  assert.equal(b.activities.getById("x").getOccupation(), 1);
});

test("database rejects taking a seat beyond capacity", () => {
  const { activities, registrations } = repositories();
  const activity = new Activity({ eventId: "e1", capacity: 1 });
  activity.register("u1");
  const extra = activity.register("u2");
  activities.add(activity);
  extra.status = "confirmed"; // burla o domínio
  assert.throws(() => registrations.upsert(extra), /Full occupation/);
  assert.equal(activities.getById(activity.id).getOccupation(), 1);
});
