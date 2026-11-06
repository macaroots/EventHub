import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { OutboxMessageBus } from "../messaging/outbox-message-bus.js";
import { RabbitMqMessageBus } from "../messaging/rabbitmq-message-bus.js";

const fakeBroker = () => ({
  sent: [], down: false,
  async publish(m) { if (this.down) throw new Error("down"); this.sent.push(m); },
  listen() {}, async consume() {},
});
const setup = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE things (id TEXT PRIMARY KEY)");
  const broker = fakeBroker();
  return { db, broker, bus: new OutboxMessageBus(db, broker) };
};

test("outbox: message is sent only if the transaction commits, with messageId", async () => {
  const { db, broker, bus } = setup();
  assert.throws(() => bus.transaction(() => {
    db.prepare("INSERT INTO things VALUES ('a')").run();
    bus.publish({ type: "Lost" });
    throw new Error("boom");
  }));
  bus.transaction(() => {
    db.prepare("INSERT INTO things VALUES ('b')").run();
    bus.publish({ type: "Kept", id: "b" });
  });
  await bus.flush();
  assert.deepEqual(broker.sent.map((m) => m.type), ["Kept"]);
  assert.equal(broker.sent[0].id, "b"); // não sobrescreve o id do domínio
  assert.match(broker.sent[0].messageId, /^[0-9a-f-]{36}$/);
  assert.equal(bus.pending(), 0);
});

test("outbox: broker down keeps messages, in order, until it is back", async () => {
  const { broker, bus } = setup();
  broker.down = true;
  bus.publish({ type: "A" });
  bus.publish({ type: "B" });
  await bus.flush();
  assert.equal(bus.pending(), 2);
  broker.down = false;
  await bus.flush();
  assert.deepEqual(broker.sent.map((m) => m.type), ["A", "B"]);
  assert.equal(bus.pending(), 0);
});

// Canal AMQP fake: guarda o callback do consume, os acks e os envios para outras filas.
const fakeChannel = () => ({
  acks: [], nacks: [], queued: [],
  assertQueue: async () => {}, bindQueue: async () => {}, prefetch: async () => {},
  consume: async function (queue, fn) { this.deliver = fn; },
  ack(m) { this.acks.push(m); }, nack(m) { this.nacks.push(m); },
  sendToQueue(queue, content, props, cb) { this.queued.push({ queue, props }); cb(); },
});
const delivery = (event, headers) => ({ content: Buffer.from(JSON.stringify(event)), properties: { messageId: event.messageId, headers } });

test("consumer: duplicate messageId is handled once", async () => {
  const channel = fakeChannel();
  const bus = new RabbitMqMessageBus(channel);
  const { inbox } = new OutboxMessageBus(new DatabaseSync(":memory:"), bus);
  const handled = [];
  bus.listen("X", (e) => handled.push(e));
  await bus.consume("q", { inbox });
  const m = delivery({ type: "X", messageId: "m1" });
  await channel.deliver(m);
  await channel.deliver(m);
  assert.equal(handled.length, 1);
  assert.equal(channel.acks.length, 2);
});

test("consumer: failure goes to retry, then to the DLQ after the last attempt", async () => {
  const channel = fakeChannel();
  const bus = new RabbitMqMessageBus(channel);
  bus.listen("X", () => { throw new Error("fail"); });
  await bus.consume("q");
  await channel.deliver(delivery({ type: "X", messageId: "m1" }));
  await channel.deliver(delivery({ type: "X", messageId: "m1" }, { "x-attempt": 5 }));
  assert.deepEqual(channel.queued.map((q) => q.queue), ["q.retry", "q.dlq"]);
  assert.equal(channel.queued[0].props.headers["x-attempt"], 2);
  assert.equal(channel.queued[1].props.headers["x-error"], "fail");
  assert.equal(channel.acks.length, 2);
});
