import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { RegistrationSqliteRepository } from "../src/infrastructure/registration.sqlite.repository.js";
import { EventSqliteRepository, ParticipantSqliteRepository } from "../src/infrastructure/projection.sqlite.repository.js";
import { RegistrationAppService } from "../src/application/registration.app-service.js";
import { InMemoryMessageBus } from "../../shared/messaging/in-memory-message-bus.js";

const organizer = { id: "org", role: "user" };
const participant = { id: "u1", role: "user" };
const stranger = { id: "x", role: "user" };

const setup = async ({ price = 0, rules = [] } = {}) => {
  const db = new DatabaseSync(":memory:");
  const registrations = new RegistrationSqliteRepository(db);
  const service = new RegistrationAppService(new ActivitySqliteRepository(db, registrations), registrations,
    new ParticipantSqliteRepository(db), new EventSqliteRepository(db), new InMemoryMessageBus());
  await service.updateEvent({ eventId: "e1", name: "E", status: "published", organizers: ["org"] });
  service.upsertActivity({ activityId: "a1", eventId: "e1", name: "A", capacity: 2, price, rules });
  service.upsertParticipant({ userId: "u1", username: "ana" });
  const registration = await service.register({ activityId: "a1" }, "u1");
  return { service, registration };
};

test("organizer lists activity registrations; others are forbidden", async () => {
  const { service } = await setup();
  const data = service.listActivityRegistrations("a1", organizer);
  assert.equal(data.activity.confirmedOccupation, 1);
  assert.equal(data.registrations[0].participant.username, "ana");
  assert.throws(() => service.listActivityRegistrations("a1", stranger), /Not allowed/);
  assert.ok(service.listActivityRegistrations("a1", { id: "adm", role: "admin" }));
});

test("organizer fulfills age verification but not payment", async () => {
  const { service, registration } = await setup({ price: 10, rules: [{ type: "minimumAge", age: 18 }] });
  const [age, payment] = registration.requirements;
  await assert.rejects(service.fulfillRequirement(registration.id, age.id, participant), /Not allowed/);
  await assert.rejects(service.fulfillRequirement(registration.id, payment.id, organizer), /cannot be fulfilled manually/);
  const updated = await service.fulfillRequirement(registration.id, age.id, organizer);
  assert.equal(updated.requirements[0].fulfilled, true);
  assert.equal(updated.status, "pending");
});

test("participant or organizer cancels; stranger cannot", async () => {
  const { service, registration } = await setup();
  await assert.rejects(service.cancelRegistration(registration.id, {}, stranger), /Not allowed/);
  const canceled = await service.cancelRegistration(registration.id, { reason: "no-show" }, organizer);
  assert.deepEqual([canceled.status, canceled.reasons], ["canceled", ["no-show"]]);
});

test("organizer change in the event updates the projection", async () => {
  const { service } = await setup();
  await service.updateEvent({ eventId: "e1", name: "E", status: "published", organizers: ["org", "x"] });
  assert.ok(service.listActivityRegistrations("a1", stranger));
});
