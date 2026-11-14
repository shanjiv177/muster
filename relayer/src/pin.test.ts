import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { KeyPair } from "near-api-js";
import { checkShape, pinMessage, type PinRequest } from "./pin.js";

const kp = KeyPair.fromRandom("ed25519");
const bytes = Buffer.from(JSON.stringify({ title: "Juhu Beach cleanup" }));
function req(over: Partial<PinRequest> = {}, body = bytes, now = Date.now()): PinRequest {
  const msg = pinMessage("org.testnet", createHash("sha256").update(body).digest("hex"), now);
  return {
    account: "org.testnet", publicKey: kp.getPublicKey().toString(), timestamp: now, name: "meta.json", contentType: "application/json",
    signature: Buffer.from(kp.sign(new TextEncoder().encode(msg)).signature).toString("base64"), data: body.toString("base64"), ...over,
  };
}

test("accepts a correctly signed JSON pin", () => assert.equal(checkShape(req(), bytes), null));
test("rejects a signature over different bytes", () => assert.match(checkShape(req(), Buffer.from("other"))!, /bad signature/));
test("rejects another account name", () => assert.match(checkShape(req({ account: "mallory.testnet" }), bytes)!, /bad signature/));
test("rejects old timestamps", () => { const t = Date.now() - 10 * 60_000; assert.match(checkShape(req({}, bytes, t), bytes)!, /too old/); });
test("rejects other content types and big files", () => {
  assert.match(checkShape(req({ contentType: "text/html" }), bytes)!, /not allowed/);
  const big = Buffer.alloc(2_000_001);
  assert.match(checkShape(req({}, big), big)!, /larger/);
});
