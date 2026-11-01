import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { InMemoryMessageBus } from "../../shared/messaging/in-memory-message-bus.js";
import { EventSqliteRepository } from "../src/infrastructure/event.sqlite.repository.js";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { EventAppService } from "../src/application/event.app-service.js";
import { ActivityAppService } from "../src/application/activity.app-service.js";
import { Activity } from "../src/domain/activity.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  const bus = new InMemoryMessageBus();
  const messages = [];
  for (const t of ["EventCreated", "ActivityCreated", "ActivityUpdated", "ActivityDeleted"]) bus.listen(t, (m) => messages.push(m));
  const events = new EventSqliteRepository(db);
  const activities = new ActivitySqliteRepository(db);
  return {
    messages,
    activities,
    eventService: new EventAppService(events, activities, bus),
    activityService: new ActivityAppService(activities, events, bus),
  };
}

test("activity requires eventId and valid capacity", () => {
  assert.throws(() => new Activity({ name: "a", capacity: 1 }), /eventId/);
  assert.throws(() => new Activity({ eventId: "e", name: "a", capacity: -1 }), /capacity/);
});

test("creating an activity publishes ActivityCreated, not EventCreated with capacity", async () => {
  const { eventService, activityService, messages } = setup();
  const eventId = await eventService.create({ name: "Congresso" });
  const activityId = await activityService.create({ eventId, name: "Workshop", capacity: 30, price: 50 });
  assert.deepEqual(messages.at(-1), { type: "ActivityCreated", activityId, eventId, capacity: 30, price: 50 });
  assert.equal(messages[0].capacity, undefined);
});

test("activity needs an existing event", async () => {
  const { activityService } = setup();
  await assert.rejects(activityService.create({ eventId: "x", name: "a", capacity: 1 }), /event not found/);
});

test("update publishes ActivityUpdated and persists", async () => {
  const { eventService, activityService, activities, messages } = setup();
  const eventId = await eventService.create({ name: "Congresso" });
  const id = await activityService.create({ eventId, name: "Workshop", capacity: 30 });
  await activityService.update(id, { name: "Workshop", capacity: 40 });
  assert.equal(activities.getById(id).capacity, 40);
  assert.equal(messages.at(-1).type, "ActivityUpdated");
});

test("event with activities cannot be deleted", async () => {
  const { eventService, activityService } = setup();
  const eventId = await eventService.create({ name: "Congresso" });
  await activityService.create({ eventId, name: "Workshop", capacity: 30 });
  await assert.rejects(eventService.delete(eventId), /has activities/);
});
