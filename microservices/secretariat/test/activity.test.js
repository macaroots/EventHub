import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { InMemoryMessageBus } from "../../shared/messaging/in-memory-message-bus.js";
import { EventSqliteRepository } from "../src/infrastructure/event.sqlite.repository.js";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { EventAppService } from "../src/application/event.app-service.js";
import { ActivityAppService } from "../src/application/activity.app-service.js";
import { Activity } from "../src/domain/activity.js";

const alice = { id: "alice", role: "user" };
const bob = { id: "bob", role: "user" };
const admin = { id: "root", role: "admin" };
const dates = { startDate: "2026-12-01", endDate: "2026-12-03" };

function setup() {
  const db = new DatabaseSync(":memory:");
  const bus = new InMemoryMessageBus();
  const messages = [];
  for (const t of ["EventCreated", "EventPublished", "EventCanceled", "ActivityCreated", "ActivityUpdated", "ActivityDeleted"]) bus.listen(t, (m) => messages.push(m));
  const events = new EventSqliteRepository(db);
  const activities = new ActivitySqliteRepository(db);
  const eventService = new EventAppService(events, activities, bus);
  const activityService = new ActivityAppService(activities, events, bus);
  const newEvent = async (user = alice, data = {}) => {
    const eventId = await eventService.create({ name: "Congresso", ...dates, ...data }, user);
    const activityId = await activityService.create({ eventId, name: "Workshop", capacity: 30 }, user);
    return { eventId, activityId };
  };
  return { messages, activities, eventService, activityService, newEvent };
}

test("activity validates rules and partial update keeps other fields", () => {
  assert.throws(() => Activity.create({ eventId: "e", name: "a", capacity: 1, rules: [{ type: "x" }] }), /Unknown rule/);
  const a = Activity.create({ eventId: "e", name: "a", capacity: 1 });
  a.update({ capacity: 5 });
  assert.equal(a.toJSON().name, "a");
  assert.equal(a.toJSON().capacity, 5);
});

test("ActivityCreated carries capacity and rules", async () => {
  const { eventService, activityService, messages } = setup();
  const eventId = await eventService.create({ name: "Congresso" }, alice);
  const rules = [{ type: "payment", amount: 5, description: "Taxa" }, { type: "minimumAge", age: 18 }];
  const activityId = await activityService.create({ eventId, name: "Workshop", capacity: 30, rules }, alice);
  const m = messages.at(-1);
  assert.equal(m.type, "ActivityCreated");
  assert.equal(m.activityId, activityId);
  assert.deepEqual(m.rules, rules);
});

test("creator is organizer; other users can't manage", async () => {
  const { eventService, newEvent } = setup();
  const { eventId } = await newEvent();
  assert.equal((await eventService.get(eventId, alice)).activities.length, 1);
  await assert.rejects(eventService.get(eventId, bob), /Not allowed/);
  await assert.rejects(eventService.update(eventId, { name: "x" }, bob), /Not allowed/);
  assert.equal((await eventService.list({}, bob)).length, 0);
  assert.equal((await eventService.list({}, admin)).length, 1);
});

test("organizer manages and publishes, but only the creator deletes", async () => {
  const { eventService, activityService, newEvent } = setup();
  const { eventId, activityId } = await newEvent();
  await eventService.addOrganizer(eventId, { userId: bob.id }, alice);
  await activityService.update(activityId, { capacity: 50 }, bob);
  await assert.rejects(eventService.delete(eventId, bob), /Not allowed/);
  await eventService.delete(eventId, alice);
});

test("publish requires dates and activities", async () => {
  const { eventService, newEvent, messages } = setup();
  const empty = await eventService.create({ name: "Vazio", ...dates }, alice);
  await assert.rejects(eventService.publish(empty, alice), /no activities/);
  const { eventId } = await newEvent(alice, { name: "Sem data", startDate: undefined, endDate: undefined });
  await assert.rejects(eventService.publish(eventId, alice), /startDate/);
  await eventService.update(eventId, dates, alice);
  await eventService.publish(eventId, alice);
  assert.equal(messages.at(-1).type, "EventPublished");
  await assert.rejects(eventService.publish(eventId, alice), /Cannot publish a published/);
});

test("published event must be canceled before delete; canceled can't be edited", async () => {
  const { eventService, activityService, newEvent, messages } = setup();
  const { eventId, activityId } = await newEvent();
  await eventService.publish(eventId, alice);
  await assert.rejects(activityService.delete(activityId, alice), /published/);
  await assert.rejects(eventService.delete(eventId, alice), /Cancel the event/);
  await assert.rejects(eventService.cancel(eventId, {}, alice), /reason/);
  await eventService.cancel(eventId, { reason: "chuva" }, alice);
  assert.deepEqual([messages.at(-1).type, messages.at(-1).reason], ["EventCanceled", "chuva"]);
  await assert.rejects(eventService.update(eventId, { name: "x" }, alice), /canceled/);
  await assert.rejects(activityService.update(activityId, { capacity: 1 }, alice), /canceled/);
  await eventService.delete(eventId, admin);
  assert.equal(messages.at(-1).type, "ActivityDeleted");
});

test("endDate and endsAt are optional and can be cleared with null", async () => {
  const { eventService, newEvent } = setup();
  const { eventId } = await newEvent(alice, { endDate: undefined });
  await eventService.publish(eventId, alice);
  const a = Activity.create({ eventId: "e", name: "a", capacity: 1, startsAt: "2026-12-01T10:00", endsAt: "2026-12-01T12:00" });
  a.update({ endsAt: null });
  assert.deepEqual([a.toJSON().startsAt, a.toJSON().endsAt], ["2026-12-01T10:00", null]);
});
