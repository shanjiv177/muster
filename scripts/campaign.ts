// Proposes a real shift: pins its details to IPFS through the relayer, files AddBounty with
// META and MUSTER lines, and both council members approve.
//   npm run campaign -- --title "Juhu Beach cleanup" --place "Juhu Beach, Mumbai" \
//     --start 2026-11-15T03:30:00Z --hours 3 --min 90 --grace 30 --slots 20 --stipend 0.1 --about "…"
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { KeyPair } from "near-api-js";
import { loadConfig, loadNamedKey } from "./lib/config.js";
import { createCampaign } from "./lib/muster.js";

const { values: a } = parseArgs({
  options: {
    title: { type: "string" }, place: { type: "string" }, start: { type: "string" }, about: { type: "string" },
    hours: { type: "string", default: "3" }, min: { type: "string", default: "90" }, grace: { type: "string", default: "30" },
    slots: { type: "string", default: "20" }, stipend: { type: "string", default: "0.1" },
  },
});
if (!a.title || !a.place || !a.start) throw new Error("--title, --place and --start are required");
const cfg = loadConfig();
const RELAYER = process.env.RELAYER_URL ?? "https://rupee-rail.indiasouthcentral.cloudapp.azure.com/muster-relay";

async function pinJson(doc: object): Promise<string> {
  const org = cfg.organisers[0];
  const kp = KeyPair.fromString(loadNamedKey(`${org}.attest.${cfg.impactTier}`)!);
  const bytes = Buffer.from(JSON.stringify(doc));
  const timestamp = Date.now();
  const msg = `muster-pin:${org}:${createHash("sha256").update(bytes).digest("hex")}:${timestamp}`;
  const res = await fetch(`${RELAYER}/pin`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: org, publicKey: kp.getPublicKey().toString(), timestamp, signature: Buffer.from(kp.sign(new TextEncoder().encode(msg)).signature).toString("base64"), name: "campaign.json", contentType: "application/json", data: bytes.toString("base64") }),
  });
  const body: any = await res.json();
  if (!body.ok) throw new Error(`pin failed: ${body.error}`);
  return body.uri;
}

const start = Math.floor(new Date(a.start).getTime() / 1000);
const meta = a.about ? await pinJson({ title: a.title, place: a.place, about: a.about }) : undefined;
if (meta) console.log("pinned details", meta);
const c = await createCampaign(cfg, {
  title: a.title, place: a.place, meta, slots: Number(a.slots), stipendNear: a.stipend!,
  terms: { start, end: start + Math.round(Number(a.hours) * 3600), min_minutes: Number(a.min), grace_min: Number(a.grace) },
});
console.log(`bounty ${c.bountyId} is live: https://shanjiv177.github.io/muster/#/c/${c.bountyId}`);
