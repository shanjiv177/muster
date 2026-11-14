// Pins a JSON document through the hosted relayer as the organiser, then reads it back from a gateway.
//   npx tsx scripts/probes/pin.ts '{"title":"…"}'
import { createHash } from "node:crypto";
import { KeyPair } from "near-api-js";
import { loadConfig, loadNamedKey } from "../lib/config.js";

const RELAYER = process.env.RELAYER_URL ?? "https://rupee-rail.indiasouthcentral.cloudapp.azure.com/muster-relay";
const cfg = loadConfig();
const org = cfg.organisers[0];
const kp = KeyPair.fromString(loadNamedKey(`${org}.attest.${cfg.impactTier}`)!);
const bytes = Buffer.from(process.argv[2] ?? JSON.stringify({ title: "Pin test", at: new Date().toISOString() }));
const timestamp = Date.now();
const msg = `muster-pin:${org}:${createHash("sha256").update(bytes).digest("hex")}:${timestamp}`;
const res = await fetch(`${RELAYER}/pin`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ account: org, publicKey: kp.getPublicKey().toString(), timestamp, signature: Buffer.from(kp.sign(new TextEncoder().encode(msg)).signature).toString("base64"), name: "campaign.json", contentType: "application/json", data: bytes.toString("base64") }),
});
const body: any = await res.json();
console.log(res.status, body);
if (body.cid) {
  const g = await fetch(`https://gateway.pinata.cloud/ipfs/${body.cid}`);
  console.log("gateway", g.status, (await g.text()).slice(0, 200));
}
