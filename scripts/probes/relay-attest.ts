// Relays an organiser check-in signed by the scoped FunctionCall key through the local relayer.
//   npm run relayer &   then   npx tsx scripts/probes/relay-attest.ts <bounty_id> <volunteer> [In|Out]
import { actions, encodeSignedDelegate } from "near-api-js";
import { balance, fmt, tgas } from "../lib/near.js";
import { loadConfig } from "../lib/config.js";
import { organiserScoped } from "../lib/muster.js";

const [bounty, volunteer, kind = "In"] = process.argv.slice(2);
const cfg = loadConfig();
const org = organiserScoped(cfg);
const before = { org: await balance(cfg.organisers[0]), relay: await balance(cfg.relayer!) };
const { signedDelegate } = await org.createSignedMetaTransaction({
  receiverId: cfg.impactTier,
  actions: [actions.functionCall("attest", { bounty_id: Number(bounty), volunteer, kind }, tgas(60), 0n)],
  blockHeightTtl: 120,
} as any);
const res = await fetch(`${process.env.RELAYER_URL ?? "http://localhost:8787"}/relay`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ signedDelegate: Buffer.from(encodeSignedDelegate(signedDelegate)).toString("base64") }),
});
console.log(res.status, await res.json());
console.log(`organiser ${fmt((await balance(cfg.organisers[0])) - before.org)} NEAR, relayer ${fmt((await balance(cfg.relayer!)) - before.relay)} NEAR`);
