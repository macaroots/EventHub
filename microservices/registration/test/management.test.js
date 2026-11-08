import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { RegistrationSqliteRepository } from "../src/infrastructure/registration.sqlite.repository.js";
import { EventSqliteRepository } from "../src/infrastructure/event.sqlite.repository.js";
import { ParticipantSqliteRepository } from "../src/infrastructure/participant.sqlite.repository.js";
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
  service.publishEvent({ eventId: "e1", name: "E", organizers: ["org"], activities: [{ activityId: "a1", name: "A", capacity: 2, price, rules }] });
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

test("organizer fulfills age verification, then payment is requested", async () => {
  const { service, registration } = await setup({ price: 10, rules: [{ type: "minimumAge", age: 18 }] });
  const [age] = registration.requirements;
  await assert.rejects(service.fulfillRequirement(registration.id, age.id, participant), /Not allowed/);
  await assert.rejects(service.fulfillRequirement(registration.id, "x", organizer), /requirement not found/);
  const updated = await service.fulfillRequirement(registration.id, age.id, organizer);
  assert.equal(updated.requirements[0].fulfilled, true);
  assert.equal(updated.status, "awaiting_payment");
  await service.confirmPayment({ registrationId: registration.id, paymentId: updated.payment.id });
  assert.equal(service.getRegistration(registration.id, participant).status, "confirmed");
});

test("participant or organizer cancels; stranger cannot", async () => {
  const { service, registration } = await setup();
  await assert.rejects(service.cancelRegistration(registration.id, {}, stranger), /Not allowed/);
  const canceled = await service.cancelRegistration(registration.id, { reason: "no-show" }, organizer);
  assert.deepEqual([canceled.status, canceled.reasons], ["canceled", ["no-show"]]);
});

test("organizer change in the event updates the projection", async () => {
  const { service } = await setup();
  service.changeOrganizers({ eventId: "e1", organizers: ["org", "x"] });
  assert.ok(service.listActivityRegistrations("a1", stranger));
});

test("waitlist exposes only ids in order; registration shows its position", async () => {
  const { service } = await setup({ price: 10 });
  for (const u of ["u2", "u3", "u4"]) {
    service.upsertParticipant({ userId: u, username: u });
    await service.register({ activityId: "a1" }, u);
  }
  const waitlist = service.getWaitlist("a1");
  assert.equal(waitlist.length, 2);
  assert.ok(waitlist.every(id => typeof id == "string"));
  assert.equal(service.getRegistration(waitlist[1], { id: "u4", role: "user" }).waitlistPosition, 2);
  assert.equal(service.getRegistration(waitlist[1], organizer).userId, "u4");
});

test("published snapshot is created once; event cancel cancels registrations", async () => {
  const { service, registration } = await setup();
  service.publishEvent({ eventId: "e1", name: "Outro", organizers: [], activities: [{ activityId: "a1", name: "B", capacity: 99 }] });
  const { activity, event } = service.listActivityRegistrations("a1", organizer);
  assert.deepEqual([event.name, activity.name, activity.capacity], ["E", "A", 2]);
  await service.cancelEvent({ eventId: "e1", reason: "chuva" });
  assert.equal(service.getRegistration(registration.id, participant).status, "canceled");
  await assert.rejects(service.register({ activityId: "a1" }, "u1"), /not open/);
  await service.cancelEvent({ eventId: "draft", reason: "x" }); // nunca publicado: ignora
});
