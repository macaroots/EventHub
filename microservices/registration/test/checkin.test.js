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
import { InMemoryMessageBus } from "../../shared/messaging/in-memory-message-bus.js";

const organizer = { id: "org", role: "user" };
const ana = { id: "u1", role: "user" };
const bia = { id: "u2", role: "user" };
const stranger = { id: "x", role: "user" };

const setup = async ({ price = 0 } = {}) => {
  const db = new DatabaseSync(":memory:");
  const messageBus = new InMemoryMessageBus();
  const published = [];
  messageBus.listen("AttendanceRegistered", m => published.push(m));
  const registrationRepository = new RegistrationSqliteRepository(db);
  const activityRepository = new ActivitySqliteRepository(db, registrationRepository);
  const eventRepository = new EventSqliteRepository(db);
  const participantRepository = new ParticipantSqliteRepository(db);
  const attendanceRepository = new AttendanceSqliteRepository(db);
  const registrations = new RegistrationAppService(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus, { attendanceRepository });
  const checkIns = new CheckInAppService({ activityRepository, registrationRepository, eventRepository, participantRepository,
    checkInRepository: new CheckInSqliteRepository(db), attendanceRepository, messageBus });
  registrations.publishEvent({ eventId: "e1", name: "E", organizers: ["org"], activities: [{ activityId: "a1", name: "A", capacity: 5, price }] });
  for (const [userId, username] of [["u1", "ana"], ["u2", "bia"]]) registrations.upsertParticipant({ userId, username });
  const registration = await registrations.register({ activityId: "a1" }, "u1");
  return { registrations, checkIns, registration, published };
};

test("participant checks in with the code; second time is not duplicated", async () => {
  const { registrations, checkIns, registration, published } = await setup();
  const { checkIn } = checkIns.open("a1", organizer);
  assert.match(checkIn.code, /^[A-Z2-9]{6}$/);
  const first = await checkIns.checkIn({ activityId: "a1", code: ` ${checkIn.code.toLowerCase()} ` }, ana);
  assert.deepEqual([first.registrationId, first.method, first.alreadyCheckedIn], [registration.id, "code", false]);
  const again = await checkIns.checkIn({ activityId: "a1", code: checkIn.code }, ana);
  assert.deepEqual([again.id, again.alreadyCheckedIn], [first.id, true]);
  assert.equal(published.length, 1);
  const panel = checkIns.get("a1", organizer);
  assert.deepEqual([panel.confirmed, panel.present], [1, 1]);
  assert.equal(registrations.getRegistration(registration.id, ana).attendance.id, first.id);
  assert.equal(registrations.listActivityRegistrations("a1", organizer).activity.present, 1);
});

test("wrong, old or closed code is refused", async () => {
  const { checkIns } = await setup();
  await assert.rejects(checkIns.checkIn({ activityId: "a1", code: "AAAAAA" }, ana), /closed or invalid/);
  const old = checkIns.open("a1", organizer).checkIn.code;
  const current = checkIns.open("a1", organizer).checkIn.code;
  if (old != current) await assert.rejects(checkIns.checkIn({ activityId: "a1", code: old }, ana), /invalid/);
  checkIns.close("a1", organizer);
  await assert.rejects(checkIns.checkIn({ activityId: "a1", code: current }, ana), /closed/);
});

test("only confirmed registrations check in", async () => {
  const { checkIns } = await setup({ price: 10 });
  const { code } = checkIns.open("a1", organizer).checkIn;
  await assert.rejects(checkIns.checkIn({ activityId: "a1", code }, ana), /not confirmed/);
  await assert.rejects(checkIns.checkIn({ activityId: "a1", code }, bia), /Not allowed/);
});

test("organizer checks in manually; others cannot manage", async () => {
  const { checkIns, registration } = await setup();
  assert.throws(() => checkIns.open("a1", stranger), /Not allowed/);
  assert.throws(() => checkIns.get("a1", ana), /Not allowed/);
  await assert.rejects(checkIns.checkInManually(registration.id, ana), /Not allowed/);
  const attendance = await checkIns.checkInManually(registration.id, organizer);
  assert.deepEqual([attendance.method, attendance.checkedInBy], ["manual", "org"]);
});

test("presence stays after the registration is canceled", async () => {
  const { registrations, checkIns, registration } = await setup();
  await checkIns.checkInManually(registration.id, organizer);
  await registrations.cancelRegistration(registration.id, {}, ana);
  const panel = checkIns.get("a1", organizer);
  assert.deepEqual([panel.confirmed, panel.present, panel.attendees[0].status], [0, 1, "canceled"]);
});

test("canceled event closes check-in", async () => {
  const { registrations, checkIns } = await setup();
  const { code } = checkIns.open("a1", organizer).checkIn;
  await registrations.cancelEvent({ eventId: "e1", reason: "chuva" });
  await assert.rejects(checkIns.checkIn({ activityId: "a1", code }, ana), /not published/);
  assert.throws(() => checkIns.open("a1", organizer), /not published/);
});
