// Contrato das mensagens (RQ05): os exemplos e as mensagens geradas pelos domínios seguem os JSON Schemas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { EventAppService } from "../../secretariat/src/application/event.app-service.js";
import { ActivityAppService } from "../../secretariat/src/application/activity.app-service.js";
import { EventSqliteRepository } from "../../secretariat/src/infrastructure/event.sqlite.repository.js";
import { ActivitySqliteRepository } from "../../secretariat/src/infrastructure/activity.sqlite.repository.js";
import { Registration } from "../../registration/src/domain/registration.js";
import { Attendance } from "../../registration/src/domain/attendance.js";
import { CertificatePolicy } from "../../registration/src/domain/certificate-policy.js";
import { Payment } from "../../payment/src/domain/payment.js";
import { OutboxMessageBus } from "../../shared/messaging/outbox-message-bus.js";

const dir = new URL("../messages/", import.meta.url);
const schemas = readdirSync(dir).filter(f => f.endsWith(".schema.json")).map(f => JSON.parse(readFileSync(new URL(f, dir))));
const ajv = new Ajv({ schemas, allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const byType = Object.fromEntries(schemas.filter(s => s.title != "Envelope").map(s => [s.title, ajv.getSchema(s.$id)]));

// OutboxMessageBus real (monta o envelope), com um broker fake que guarda o que foi enviado.
const outbox = (source) => {
    const sent = [];
    const bus = new OutboxMessageBus(new DatabaseSync(":memory:"), { publish: async m => { sent.push(m); }, listen() {} }, { source });
    return { bus, sent, flush: () => bus.flush() };
};
const envelope = (data, type = "EventEnded", source = "secretariat") => ({ id: randomUUID(), type, source, time: new Date().toISOString(), data });
const assertValid = (m) => {
    const validate = byType[m.type];
    assert.ok(validate, `sem schema para ${m.type}`);
    assert.ok(validate(m), `${m.type}: ${ajv.errorsText(validate.errors)}`);
};

test("every example matches its schema", () => {
    for (const s of schemas.filter(s => s.examples)) for (const example of s.examples) assertValid(example);
});

test("schema rejects a message without envelope or with a wrong field", () => {
    const eventId = randomUUID();
    assert.equal(byType.EventEnded(envelope({ eventId })), true);
    assert.equal(byType.EventEnded({ type: "EventEnded", eventId }), false, "flat, without envelope");
    assert.equal(byType.EventEnded(envelope({ eventId }, "EventEnded", "registration")), false, "wrong source");
    assert.equal(byType.PaymentRequested(envelope({ paymentId: randomUUID(), registrationId: randomUUID(),
        userId: randomUUID(), amount: 0, description: "Ticket" }, "PaymentRequested", "registration")), false, "amount 0");
});

test("secretariat messages match the schemas", async () => {
    const db = new DatabaseSync(":memory:");
    const { bus, sent, flush } = outbox("secretariat");
    const events = new EventSqliteRepository(db), activities = new ActivitySqliteRepository(db);
    const eventService = new EventAppService(events, activities, bus);
    const activityService = new ActivityAppService(activities, events);
    const alice = { id: randomUUID(), role: "user" };
    const create = async (name) => {
        const eventId = await eventService.create({ name, startDate: "2026-12-01", endDate: "2026-12-03" }, alice);
        await activityService.create({ eventId, name: "Workshop", capacity: 30, price: 50,
            startsAt: "2026-12-01T09:00:00Z", endsAt: "2026-12-01T12:00:00Z", rules: [{ type: "minimumAge", age: 18 }] }, alice);
        await activityService.create({ eventId, name: "Palestra", capacity: 0 }, alice);
        await eventService.publish(eventId, alice);
        return eventId;
    };
    const a = await create("Congresso"), b = await create("Simpósio");
    await eventService.addOrganizer(a, { userId: randomUUID() }, alice);
    await eventService.end(a, alice, new Date("2026-12-04"));
    await eventService.cancel(b, { reason: "Falta de quórum" }, alice);
    await flush();
    assert.deepEqual(sent.map(m => m.type), ["EventPublished", "EventPublished", "EventOrganizersChanged", "EventEnded", "EventCanceled"]);
    sent.forEach(assertValid);
});

test("registration messages match the schemas", async () => {
    const { bus, sent, flush } = outbox("registration");
    const messages = [];
    const paid = new Registration({ userId: randomUUID(), activityId: randomUUID() });
    paid.submit(true, 50);
    paid.pay();
    const waiting = new Registration({ userId: randomUUID(), activityId: randomUUID() });
    waiting.require({ type: "age verification", minimumAge: 18 });
    waiting.submit(false, 0);
    waiting.promote(0);
    waiting.cancel("Event canceled: Falta de quórum");
    for (const r of [paid, waiting]) messages.push(...r.pullMessages());

    const userId = randomUUID(), activityId = randomUUID();
    const attendance = new Attendance({ registrationId: paid.id, activityId, userId, method: "code", checkedInBy: userId });
    messages.push(attendance.toMessage());
    const event = { id: randomUUID(), name: "Congresso" };
    messages.push(...new CertificatePolicy().requests(event,
        [{ id: activityId, name: "Workshop", startsAt: "2026-12-01T09:00:00Z", endsAt: "2026-12-01T12:30:00Z" }],
        [attendance], new Map([[userId, { name: "ana" }]])));
    messages.forEach(m => bus.publish(m));
    await flush();

    assert.deepEqual(sent.map(m => m.type), ["RegistrationCreated", "PaymentRequested", "RegistrationConfirmed",
        "RegistrationCreated", "RegistrationPromoted", "RegistrationCanceled", "AttendanceRegistered", "CertificateRequested"]);
    sent.forEach(assertValid);
});

test("payment messages match the schemas", async () => {
    const { bus, sent, flush } = outbox("payment");
    const ok = new Payment(50, randomUUID(), { registrationId: randomUUID(), description: "Ticket" });
    ok.pay("pix-123");
    const ko = new Payment(50, randomUUID(), { registrationId: randomUUID(), description: "Ticket" });
    ko.deny("Denied by gateway");
    [...ok.pullMessages(), ...ko.pullMessages()].forEach(m => bus.publish(m));
    await flush();
    sent.forEach(assertValid);
});

test("identity messages match the schemas", async () => {
    // O identity lê a config no import; o OutboxMessageBus real monta o envelope, com broker fake.
    Object.assign(process.env, { DATABASE_URL: "postgres://fake", JWT_SECRET: "test", INTERNAL_API_TOKEN: "test", LOG_LEVEL: "silent" });
    const { UserAppService } = await import("../../identity/src/application/user.app-service.js");
    const { bus, sent, flush } = outbox("identity");
    const repo = { getByUsername: async () => null, add: async () => {} };
    const service = new UserAppService(repo, bus, { hash: async () => "xx" });
    await service.signin({ username: "ana", email: "ana@example.com", password: "12345678" });
    await flush();
    assert.deepEqual(sent.map(m => m.type), ["UserRegistered"]);
    sent.forEach(assertValid);
});
