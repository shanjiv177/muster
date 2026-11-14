// Who pays the deposit inside a NEP-366 delegate action: the sender or the relayer?
//   npx tsx scripts/probes/delegate-deposit.ts
import { actions } from "near-api-js";
import { account, balance, fmt, near, summarize } from "../lib/near.js";

const SENDER = "muster-guest.testnet";
const RELAYER = process.env.PROBE_RELAYER ?? "muster-tier.testnet";
const TO = "muster-council-2.testnet";

const before = { s: await balance(SENDER), r: await balance(RELAYER), t: await balance(TO) };
const { signedDelegate } = await account(SENDER).createSignedMetaTransaction({ receiverId: TO, actions: [actions.transfer(near(0.2))], blockHeightTtl: 100 } as any);
const res = summarize(await account(RELAYER).relayMetaTransaction(signedDelegate));
const after = { s: await balance(SENDER), r: await balance(RELAYER), t: await balance(TO) };
console.log(res.ok ? "ok" : `FAIL ${res.error}`, res.link);
console.log(`sender  ${fmt(after.s - before.s)} NEAR\nrelayer ${fmt(after.r - before.r)} NEAR\nreceiver ${fmt(after.t - before.t)} NEAR`);
