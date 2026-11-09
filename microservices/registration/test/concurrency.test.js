import assert from "node:assert/strict";
import { test } from "node:test";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEAT_STATUSES } from "../src/domain/registration.js";

// Cada worker é uma "instância" do serviço com sua conexão ao mesmo arquivo SQLite.
const WORKERS = 8, PER_WORKER = 25, CAPACITY = 30;

const worker = `
import { workerData, parentPort } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
const { file, users, start, src, shared } = workerData;
const { ActivitySqliteRepository } = await import(src + "/infrastructure/activity.sqlite.repository.js");
const { RegistrationSqliteRepository } = await import(src + "/infrastructure/registration.sqlite.repository.js");
const { EventSqliteRepository } = await import(src + "/infrastructure/event.sqlite.repository.js");
const { ParticipantSqliteRepository } = await import(src + "/infrastructure/participant.sqlite.repository.js");
const { RegistrationAppService } = await import(src + "/application/registration.app-service.js");
const { InMemoryMessageBus } = await import(shared + "/messaging/in-memory-message-bus.js");
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout = 5000");
const registrations = new RegistrationSqliteRepository(db);
const service = new RegistrationAppService(new ActivitySqliteRepository(db, registrations), registrations,
  new ParticipantSqliteRepository(db), new EventSqliteRepository(db), new InMemoryMessageBus());
Atomics.wait(start, 0, 0); // todos começam juntos
const results = [];
for (const u of users) {
  try { results.push((await service.register({ activityId: "a1" }, u)).status); }
  catch (e) { results.push("error: " + e.message); }
}
parentPort.postMessage(results);
`;

test(`${WORKERS * PER_WORKER} concurrent registrations never exceed capacity ${CAPACITY}`, async () => {
  const file = join(mkdtempSync(join(tmpdir(), "registration-")), "db.sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  const { RegistrationSqliteRepository } = await import("../src/infrastructure/registration.sqlite.repository.js");
  const { ActivitySqliteRepository } = await import("../src/infrastructure/activity.sqlite.repository.js");
  const { EventSqliteRepository } = await import("../src/infrastructure/event.sqlite.repository.js");
  const { ParticipantSqliteRepository } = await import("../src/infrastructure/participant.sqlite.repository.js");
  const { RegistrationAppService } = await import("../src/application/registration.app-service.js");
  const { InMemoryMessageBus } = await import("../../shared/messaging/in-memory-message-bus.js");
  const registrations = new RegistrationSqliteRepository(db);
  const activities = new ActivitySqliteRepository(db, registrations);
  const service = new RegistrationAppService(activities, registrations, new ParticipantSqliteRepository(db), new EventSqliteRepository(db), new InMemoryMessageBus());
  service.publishEvent({ eventId: "e1", name: "E", activities: [{ activityId: "a1", name: "A", capacity: CAPACITY, price: 10 }] });
  const users = Array.from({ length: WORKERS * PER_WORKER }, (_, i) => `u${i}`);
  for (const u of users) service.upsertParticipant({ userId: u, name: u });

  const start = new Int32Array(new SharedArrayBuffer(4));
  const src = new URL("../src", import.meta.url).href, shared = new URL("../../shared", import.meta.url).href;
  const runs = Array.from({ length: WORKERS }, (_, w) => new Promise((ok, fail) => {
    const t = new Worker(worker, { eval: true, workerData: { file, start, src, shared, users: users.slice(w * PER_WORKER, (w + 1) * PER_WORKER) } });
    t.once("message", ok).once("error", fail);
  }));
  await new Promise(ok => setTimeout(ok, 200)); // workers prontos
  Atomics.store(start, 0, 1);
  Atomics.notify(start, 0);
  const statuses = (await Promise.all(runs)).flat();

  assert.deepEqual(statuses.filter(s => s.startsWith("error")), []);
  const saved = activities.getById("a1");
  assert.equal(saved.getOccupation(), CAPACITY);
  assert.equal(saved.registrations.length, users.length);
  assert.equal(saved.registrations.filter(r => r.status == "waitlisted").length, users.length - CAPACITY);
  assert.equal(statuses.filter(s => SEAT_STATUSES.includes(s)).length, CAPACITY);
});
