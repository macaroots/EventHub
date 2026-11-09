import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActivitySqliteRepository } from "../src/infrastructure/activity.sqlite.repository.js";
import { RegistrationSqliteRepository } from "../src/infrastructure/registration.sqlite.repository.js";
import { EventSqliteRepository } from "../src/infrastructure/event.sqlite.repository.js";
import { ParticipantSqliteRepository } from "../src/infrastructure/participant.sqlite.repository.js";
import { CheckInSqliteRepository } from "../src/infrastructure/check-in.sqlite.repository.js";
import { AttendanceSqliteRepository } from "../src/infrastructure/attendance.sqlite.repository.js";
import { RegistrationAppService } from "../src/application/registration.app-service.js";
import { CheckInAppService } from "../src/application/check-in.app-service.js";
import { CertificateAppService } from "../src/application/certificate.app-service.js";
import { InMemoryMessageBus } from "../../shared/messaging/in-memory-message-bus.js";

const organizer = { id: "org", role: "user" };

const setup = async () => {
  const db = new DatabaseSync(":memory:");
  const messageBus = new InMemoryMessageBus();
  const requested = [];
  messageBus.listen("CertificateRequested", m => requested.push(m));
  const registrationRepository = new RegistrationSqliteRepository(db);
  const activityRepository = new ActivitySqliteRepository(db, registrationRepository);
  const eventRepository = new EventSqliteRepository(db);
  const participantRepository = new ParticipantSqliteRepository(db);
  const attendanceRepository = new AttendanceSqliteRepository(db);
  const registrations = new RegistrationAppService(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus, { attendanceRepository });
  const checkIns = new CheckInAppService({ activityRepository, registrationRepository, eventRepository, participantRepository,
    checkInRepository: new CheckInSqliteRepository(db), attendanceRepository, messageBus });
  const certificates = new CertificateAppService({ activityRepository, eventRepository, participantRepository, attendanceRepository, messageBus });
  registrations.publishEvent({ eventId: "e1", name: "Congresso", organizers: ["org"], activities: [
    { activityId: "a1", name: "Workshop", startsAt: "2026-12-01T09:00:00Z", endsAt: "2026-12-01T12:30:00Z", capacity: 5, price: 0 },
    { activityId: "a2", name: "Palestra", capacity: 5, price: 0 },
  ] });
  for (const [userId, name] of [["u1", "ana"], ["u2", "bia"]]) registrations.upsertParticipant({ userId, name });
  return { registrations, checkIns, certificates, requested };
};

test("ended event requests one certificate per participant with the attended activities", async () => {
  const { registrations, checkIns, certificates, requested } = await setup();
  const a1 = await registrations.register({ activityId: "a1" }, "u1");
  await registrations.register({ activityId: "a2" }, "u1"); // inscrita, sem presença: fora da lista
  await registrations.register({ activityId: "a1" }, "u2"); // sem presença: sem certificado
  await checkIns.checkInManually(a1.id, organizer);
  certificates.endEvent({ eventId: "e1" });
  assert.deepEqual(requested, [{
    type: "CertificateRequested", requestId: "e1:u1", eventId: "e1", userId: "u1", participantName: "ana", eventName: "Congresso",
    activities: [{ activityId: "a1", name: "Workshop", workload: 3.5, date: "2026-12-01" }], totalWorkload: 3.5,
  }]);
  assert.equal(registrations.getRegistration(a1.id, { id: "u1" }).event.status, "ended");
});

test("activity without schedule has null workload and uses check-in date", async () => {
  const { registrations, checkIns, certificates, requested } = await setup();
  const a1 = await registrations.register({ activityId: "a1" }, "u1");
  const a2 = await registrations.register({ activityId: "a2" }, "u1");
  await checkIns.checkInManually(a1.id, organizer);
  const attendance = await checkIns.checkInManually(a2.id, organizer);
  certificates.endEvent({ eventId: "e1" });
  assert.equal(requested.length, 1);
  assert.deepEqual(requested[0].activities.find(a => a.activityId == "a2"),
    { activityId: "a2", name: "Palestra", workload: null, date: attendance.checkedInAt.slice(0, 10) });
  assert.equal(requested[0].totalWorkload, 3.5);
});

test("ending twice or a canceled event requests nothing more; ended event closes check-in and registration", async () => {
  const { registrations, checkIns, certificates, requested } = await setup();
  const r = await registrations.register({ activityId: "a1" }, "u1");
  await checkIns.checkInManually(r.id, organizer);
  certificates.endEvent({ eventId: "e1" });
  certificates.endEvent({ eventId: "e1" });
  certificates.endEvent({ eventId: "unknown" });
  assert.equal(requested.length, 1);
  await assert.rejects(registrations.register({ activityId: "a1" }, "u2"), /not open/);
  assert.throws(() => checkIns.open("a1", organizer), /not published/);
});
