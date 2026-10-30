import assert from "node:assert/strict";
import { test } from "node:test";
import { Payment } from "../src/domain/payment.js";

test("should confirm payment and generate event message", async () => {
  const payment = new Payment(10, 1);
  payment.pay('receipt');
  assert.equal(payment.status, 'paid');
  assert.equal(payment.receipt, 'receipt');
  const message = payment.pullMessages()[0];
  assert.equal(message.type, 'PaymentConfirmed');
  assert.equal(message.paymentId, 1);
});