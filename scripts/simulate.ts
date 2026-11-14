// End-to-end story on testnet, scenarios A–F (FINAL-PLAN.md). Takes ~6 minutes of real time
// because attendance is timed by the chain. Writes docs/testnet-run.md and deployments/testnet.json.
//
//   A  trusted volunteer, attended            -> impact-tier votes Approve, paid automatically
//   B  new volunteer, attended                -> waits, one council vote pays, credited
//   C  no-show                                -> impact-tier votes Remove after end+grace, bond kept
//   D  gives up within the forgiveness period -> bond refunded
//   E  RSVPs to the same shift twice          -> the second RSVP reverts atomically (no bond taken)
//   F  files BountyDone naming B              -> ignored by impact-tier; rejecting it reverts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { account, balance, call, fmt, link, log, near, sleep, view, type TxResult } from "./lib/near.js";
import { act, addProposal, lastProposalId, proposal, rsvp } from "./lib/dao.js";
import { loadConfig, ROOT } from "./lib/config.js";
import { attest, createCampaign, keeperPass, settle } from "./lib/muster.js";

const cfg = loadConfig();
const V = cfg.volunteers;
const rows: { step: string; result: string; tx: string }[] = [];
let failures = 0;

function rec<T extends TxResult>(step: string, r: T, result = r.ok ? "ok" : `failed: ${r.error}`): T {
  log(step, r);
  rows.push({ step, result, tx: r.link });
  return r;
}
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${label} ${detail}`);
  rows.push({ step: `**check:** ${label}`, result: cond ? `PASS ${detail}` : `FAIL ${detail}`, tx: "" });
  if (!cond) failures++;
}
async function rsvpOf(who: string, bountyId: number) {
  const r = rec(`${who} RSVPs to bounty ${bountyId} (claim + done, one tx)`, await rsvp(account(V[who]), cfg.dao, bountyId, `RSVP from ${V[who]}`));
  if (!r.ok) throw new Error(r.error);
  return (await lastProposalId(cfg.dao)) - 1;
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const c1 = await createCampaign(cfg, {
    title: "Juhu Beach cleanup (morning)", place: "Juhu Beach, Mumbai",
    terms: { start: now, end: now + 180, min_minutes: 1, grace_min: 1 }, slots: 10, stipendNear: "0.1",
  });
  rec(`campaign 1 approved as bounty ${c1.bountyId}`, c1.tx);
  const c2 = await createCampaign(cfg, {
    title: "Juhu Beach cleanup (evening)", place: "Juhu Beach, Mumbai",
    terms: { start: now, end: now + 3600, min_minutes: 1, grace_min: 30 }, slots: 10, stipendNear: "0.1",
  });
  rec(`campaign 2 approved as bounty ${c2.bountyId}`, c2.tx);
  const b1 = c1.bountyId, b2 = c2.bountyId;

  const sponsor = await account(cfg.sponsor).transfer({ receiverId: cfg.dao, amount: near(1) } as any) as any;
  rows.push({ step: "sponsor funds the DAO with 1 NEAR", result: "ok", tx: link(sponsor.transaction.hash) });

  const pA1 = await rsvpOf("a", b1);
  const pB = await rsvpOf("b", b1);
  const pC = await rsvpOf("c", b1);
  const cBefore = await balance(V.c);
  const pD = await rsvpOf("d", b1);
  const pE1 = await rsvpOf("e", b1);
  const eBefore = await balance(V.e);
  const e2 = rec("E RSVPs to the same shift again", await rsvp(account(V.e), cfg.dao, b1, `RSVP again from ${V.e}`));
  const eDelta = (await balance(V.e)) - eBefore;
  check("E's second RSVP reverts as one unit and takes no bond", !e2.ok && e2.error!.includes("ERR_BOUNTY_CLAIM_COMPLETED") && eDelta > -near(0.01), `${e2.error} (${fmt(eDelta)} NEAR)`);
  const pA2 = await rsvpOf("a", b2);

  // F spoofs B's shift.
  const spoof = rec("F files BountyDone{receiver: B} (spoof)", await addProposal(account(V.f), cfg.dao, "spoof", { BountyDone: { bounty_id: b1, receiver_id: V.b } }));
  const pF = spoof.id!;

  // D gives up within the forgiveness period: refunded.
  const dBefore = await balance(V.d);
  rec("D gives up (bounty_giveup)", await call(account(V.d), cfg.dao, "bounty_giveup", { id: b1 }, 50));
  const dDelta = (await balance(V.d)) - dBefore;
  check("D's bond refunded on give-up", dDelta > near(0.49), `(+${fmt(dDelta)} NEAR)`);
  check("D's proposal still open but has no claim", (await proposal(cfg.dao, pD))?.status === "InProgress");

  // Organiser checks people in with the scoped key; a non-organiser cannot.
  for (const [who, b] of [["a", b1], ["b", b1], ["e", b1], ["a", b2]] as const) rec(`organiser (scoped key) checks in ${who} on bounty ${b}`, await attest(cfg, b, V[who], "In"));
  const forged = rec("F tries to attest itself (not an organiser)", await call(account(V.f), cfg.impactTier, "attest", { bounty_id: b1, volunteer: V.f, kind: "In" }, 60));
  check("non-organiser attestation rejected", !!forged.error?.includes("ERR_NOT_ORGANISER"), forged.error ?? "");
  console.log("waiting 65 s so the shift lasts at least 1 minute…");
  await sleep(65_000);
  for (const [who, b] of [["a", b1], ["b", b1], ["e", b1], ["a", b2]] as const) rec(`organiser checks out ${who} on bounty ${b}`, await attest(cfg, b, V[who], "Out"));

  // Keeper pass 1: new volunteers wait, E's duplicate is removed, the spoof is ignored.
  for (const x of await keeperPass(cfg)) rec(`keeper ${x.action} #${x.id}`, x.r, JSON.stringify(x.r.value));
  const sF = rec("settle the spoof directly", await settle(cfg, pF, b1, V.b));
  check("impact-tier ignores the spoof", sF.value?.decision === "ignore", JSON.stringify(sF.value));
  check("E's first proposal still open (new volunteer)", (await proposal(cfg.dao, pE1))?.status === "InProgress");
  check("A's first shift waits for council (new)", (await proposal(cfg.dao, pA1))?.status === "InProgress");

  // Council approves the new volunteers A and B: one vote each.
  const bBefore = await balance(V.b);
  rec("council approves A's first shift", await act(account(cfg.council[0]), cfg.dao, pA1, "VoteApprove"));
  rec("council approves B's shift", await act(account(cfg.council[0]), cfg.dao, pB, "VoteApprove"));
  const bDelta = (await balance(V.b)) - bBefore;
  check("B paid stipend + bonds", bDelta > near(0.6), `(+${fmt(bDelta)} NEAR)`);

  const rej = rec("council tries to reject F's spoof after B was paid", await act(account(cfg.council[0]), cfg.dao, pF, "VoteReject"));
  check("rejecting the spoof reverts (no bond moves to F)", !rej.ok, rej.error ?? "");

  // Keeper pass 2: credit A and B, then A's second shift is auto-approved (trusted now).
  for (const x of await keeperPass(cfg)) rec(`keeper ${x.action} #${x.id}`, x.r, JSON.stringify(x.r.value));
  const a2 = await proposal(cfg.dao, pA2);
  if (a2?.status === "InProgress") for (const x of await keeperPass(cfg)) rec(`keeper ${x.action} #${x.id}`, x.r, JSON.stringify(x.r.value));
  check("A's second shift auto-approved by impact-tier", (await proposal(cfg.dao, pA2))?.status === "Approved");
  const recA = await view<any>(cfg.impactTier, "record_of", { account: V.a });
  check("A's record has 2 verified shifts", recA.shifts === 2, JSON.stringify({ shifts: recA.shifts, minutes: recA.minutes }));

  // C is a no-show: wait for end + grace, then the keeper removes it.
  const waitMs = (now + 180 + 60 + 5) * 1000 - Date.now();
  if (waitMs > 0) { console.log(`waiting ${Math.ceil(waitMs / 1000)} s for campaign 1 end + grace…`); await sleep(waitMs); }
  for (const x of await keeperPass(cfg)) rec(`keeper ${x.action} #${x.id}`, x.r, JSON.stringify(x.r.value));
  check("C's no-show proposal removed", (await proposal(cfg.dao, pC)) === null, `#${pC}`);
  const cDelta = (await balance(V.c)) - cBefore;
  check("C's bond kept by the DAO", cDelta < near(0.01), `(${fmt(cDelta)} NEAR since RSVP)`);

  const out = {
    network: cfg.network, factory: cfg.factory, dao: cfg.dao, impactTier: cfg.impactTier,
    council: cfg.council, organisers: cfg.organisers, volunteers: V,
    run: { at: new Date().toISOString(), bounties: { c1: b1, c2: b2 }, proposals: { A1: pA1, A2: pA2, B: pB, C: pC, D: pD, E1: pE1, F: pF } },
  };
  mkdirSync(join(ROOT, "deployments"), { recursive: true });
  writeFileSync(join(ROOT, "deployments", "testnet.json"), JSON.stringify(out, null, 2) + "\n");
  const md = [
    "# Testnet run",
    "",
    `Generated by \`npm run simulate\` at ${out.run.at}. DAO [\`${cfg.dao}\`](https://testnet.nearblocks.io/address/${cfg.dao}), impact-tier [\`${cfg.impactTier}\`](https://testnet.nearblocks.io/address/${cfg.impactTier}).`,
    "",
    "| Step | Result | Tx |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.step} | ${r.result.replace(/\|/g, "\\|")} | ${r.tx ? `[tx](${r.tx})` : ""} |`),
    "",
  ].join("\n");
  writeFileSync(join(ROOT, "docs", "testnet-run.md"), md);
  console.log(`\n${failures ? `${failures} check(s) FAILED` : "all checks passed"}; wrote docs/testnet-run.md and deployments/testnet.json`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
