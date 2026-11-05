import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { Payment } from "../src/domain/payment.js";
import { PaymentSqliteRepository } from "../src/infrastructure/payment.sqlite.repository.js";

test("should persist payment state", () => {
  const repository = new PaymentSqliteRepository(new DatabaseSync(":memory:"));
  repository.add(new Payment(10, "p1", { registrationId: "r1", description: "Ticket" }));
  const payment = repository.getById("p1");
  payment.pay("ok");
  repository.update(payment);

  const loaded = repository.getById("p1");
  assert.deepEqual([loaded.status, loaded.receipt, loaded.registrationId], ["paid", "ok", "r1"]);
  assert.throws(() => loaded.pay("ok"), /already paid/);
  assert.deepEqual(loaded.pullMessages(), []);
});
