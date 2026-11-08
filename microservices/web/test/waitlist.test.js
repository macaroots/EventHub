import assert from "node:assert/strict";
import { test } from "node:test";
import { PollingWaitlistSource } from "../src/waitlist/polling-waitlist-source.js";
import { RegistrationStatus } from "../src/waitlist/registration-status.js";

test("waitlist source caches per activity and shares concurrent fetches", async () => {
  let clock = 0, calls = 0;
  const source = new PollingWaitlistSource(async () => { calls++; return ["r1", "r2"]; }, { ttlMs: 2000, now: () => clock });
  await Promise.all([source.get("a1"), source.get("a1"), source.get("a1")]);
  assert.equal(calls, 1);
  clock = 1999; await source.get("a1");
  assert.equal(calls, 1);
  clock = 2000; await source.get("a1");
  assert.equal(calls, 2);
  await source.get("a2");
  assert.equal(calls, 3);
});

test("failed fetch is not cached", async () => {
  let fail = true;
  const source = new PollingWaitlistSource(async () => { if (fail) throw new Error("down"); return ["r1"]; });
  await assert.rejects(source.get("a1"));
  fail = false;
  assert.deepEqual(await source.get("a1"), ["r1"]);
});

test("asks registration once, then polls the cached waitlist until leaving it", async () => {
  let registration = { id: "r2", activityId: "a1", status: "waitlisted", waitlistPosition: 2 };
  let waitlist = ["r1", "r2"], registrationCalls = 0;
  const status = new RegistrationStatus(async () => { registrationCalls++; return registration; }, { get: async () => waitlist });

  assert.deepEqual(await status.get("r2", "u2"), { status: "waitlisted", waitlistPosition: 2, next: null });
  waitlist = ["r2"];
  assert.deepEqual(await status.get("r2", "u2"), { status: "waitlisted", waitlistPosition: 1, next: null });
  assert.equal(registrationCalls, 1);

  waitlist = [];
  registration = { ...registration, status: "awaiting_payment", waitlistPosition: null, payment: { id: "p1" } };
  assert.deepEqual(await status.get("r2", "u2"), { status: "awaiting_payment", waitlistPosition: null, next: "/payments/p1" });
  assert.equal(registrationCalls, 2);
});

test("another user is authorized by registration, not by the cache", async () => {
  const status = new RegistrationStatus(async (id, req) => {
    if (req.user != "u2") throw new Error("Not allowed to see registration");
    return { id, activityId: "a1", status: "waitlisted", waitlistPosition: 1 };
  }, { get: async () => ["r2"] });
  await status.get("r2", "u2", { user: "u2" });
  await assert.rejects(status.get("r2", "x", { user: "x" }), /Not allowed/);
});

test("confirmed or canceled goes back to the registration page", async () => {
  const status = new RegistrationStatus(async (id) => ({ id, activityId: "a1", status: "confirmed" }), { get: async () => [] });
  assert.equal((await status.get("r 1", "u1")).next, "/registrations/r%201");
});
