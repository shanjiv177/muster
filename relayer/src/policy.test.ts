import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimit, refuse, type Allowlist } from "./policy.js";

const a: Allowlist = { dao: "dao.testnet", impactTier: "tier.testnet", maxGas: 300n * 10n ** 12n, maxActions: 4 };
const fc = (methodName: string, deposit = 0n, gas = 30n * 10n ** 12n) => ({ functionCall: { methodName, args: new Uint8Array(), gas, deposit } });

test("allows zero-deposit Muster calls", () => {
  assert.equal(refuse({ senderId: "org.testnet", receiverId: "tier.testnet", actions: [fc("attest")] }, a), null);
  assert.equal(refuse({ senderId: "v.testnet", receiverId: "dao.testnet", actions: [fc("bounty_giveup")] }, a), null);
});

test("never relays a deposit (the relayer would pay the bond)", () => {
  assert.match(refuse({ senderId: "v.testnet", receiverId: "dao.testnet", actions: [fc("bounty_giveup", 1n)] }, a)!, /deposit/);
});

test("refuses RSVP, other receivers, other methods and non-function actions", () => {
  assert.match(refuse({ senderId: "v", receiverId: "dao.testnet", actions: [fc("bounty_claim")] }, a)!, /not allowed/);
  assert.match(refuse({ senderId: "v", receiverId: "dao.testnet", actions: [fc("act_proposal")] }, a)!, /not allowed/);
  assert.match(refuse({ senderId: "v", receiverId: "evil.testnet", actions: [fc("attest")] }, a)!, /receiver/);
  assert.match(refuse({ senderId: "v", receiverId: "tier.testnet", actions: [{ transfer: { deposit: 1n } }] }, a)!, /only function calls/);
  assert.match(refuse({ senderId: "v", receiverId: "tier.testnet", actions: [] }, a)!, /count/);
  assert.match(refuse({ senderId: "v", receiverId: "tier.testnet", actions: [fc("settle", 0n, 301n * 10n ** 12n)] }, a)!, /gas/);
});

test("rate limit per sender per window", () => {
  const r = new RateLimit(2, 1000);
  assert.ok(r.take("x", 0));
  assert.ok(r.take("x", 1));
  assert.ok(!r.take("x", 2));
  assert.ok(r.take("y", 2));
  assert.ok(r.take("x", 1002));
});
