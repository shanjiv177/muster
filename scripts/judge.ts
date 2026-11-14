// Read-only checks of Muster's on-chain facts. No keys needed.   npm run judge
// Reads ids from deployments/testnet.json (committed). Exit code 0 only if every check passes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { baseEncode } from "near-api-js";
import { provider, view } from "./lib/near.js";
import { ROOT } from "./lib/config.js";
import { proposal } from "./lib/dao.js";
import { rebuild } from "./verify.js";
import { allProposals } from "./lib/muster.js";

const dep = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet.json"), "utf8"));
const { dao, impactTier: tier, factory } = dep;
const P = dep.run.proposals;
let failed = 0;
let n = 0;

function check(label: string, ok: boolean, detail: unknown = "") {
  n++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${String(n).padStart(2)}. ${label}${detail !== "" ? `  — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function main() {
  console.log(`DAO ${dao}\nimpact-tier ${tier}\nfactory ${factory}\n`);

  const daoAcct: any = await provider.viewAccount({ accountId: dao });
  const defaultHash = await view<string>(factory, "get_default_code_hash");
  check("DAO runs the factory's stock Sputnik code (code hash = factory default)", daoAcct.code_hash === defaultHash, daoAcct.code_hash);

  const fi = await view<any>(dao, "get_factory_info");
  check("factory auto-update is off (only the DAO's own vote can change its code)", fi.auto_update === false, fi);

  const policy = await view<any>(dao, "get_policy");
  const role = (name: string) => policy.roles.find((r: any) => r.name === name);
  const tierRole = role("tier");
  check("tier role is exactly [impact-tier]", sameSet(tierRole?.kind?.Group ?? [], [tier]), tierRole?.kind);
  check("tier role may only VoteApprove/VoteRemove bounty_done", sameSet(tierRole?.permissions ?? [], ["bounty_done:VoteApprove", "bounty_done:VoteRemove"]), tierRole?.permissions);
  const vol = role("volunteers");
  check("volunteers (Everyone) may only file bounty_done", vol?.kind === "Everyone" && sameSet(vol.permissions, ["bounty_done:AddProposal"]), vol?.permissions);
  check("bounty bond 0.5 NEAR, proposal bond 0.01 NEAR", policy.bounty_bond === "500000000000000000000000" && policy.proposal_bond === "10000000000000000000000", { bounty_bond: policy.bounty_bond, proposal_bond: policy.proposal_bond });

  const keys: any = await provider.viewAccessKeyList({ accountId: tier } as any);
  check("impact-tier is locked (0 access keys)", keys.keys.length === 0, `${keys.keys.length} keys`);

  const code: any = await provider.viewAccount({ accountId: tier });
  const wasm = join(ROOT, "contracts/impact-tier/target/near/impact_tier.wasm");
  if (existsSync(wasm)) {
    const local = baseEncode(createHash("sha256").update(readFileSync(wasm)).digest());
    check("impact-tier code hash = this repo's build", code.code_hash === local, { chain: code.code_hash, local });
  } else {
    console.log(`  (skip) build contracts/impact-tier with \`cargo near build non-reproducible-wasm\` to compare code hash ${code.code_hash}`);
  }
  const tcfg = await view<any>(tier, "get_config");
  check("impact-tier serves this DAO", tcfg.dao === dao, tcfg);

  const outcomes = await view<any[]>(tier, "outcomes", { from_index: 0, limit: 200 });
  const out = (id: number) => outcomes.find((o) => o.proposal_id === id)?.outcome;
  const a2 = await proposal(dao, P.A2);
  check("A (trusted, attended): auto-approved by impact-tier", a2?.status === "Approved" && a2?.votes?.[tier] === "Approve" && out(P.A2) === "approved", { status: a2?.status, vote: a2?.votes?.[tier] });
  const b = await proposal(dao, P.B);
  check("B (new, attended): approved by one council vote, then credited", b?.status === "Approved" && !b?.votes?.[tier] && out(P.B) === "credited", { status: b?.status, votes: b?.votes });
  check("C (no-show): removed by impact-tier, bond kept", (await proposal(dao, P.C)) === null && out(P.C) === "removed", out(P.C));
  const props = await allProposals(dao);
  const eOwn = props.filter((p) => p.kind?.BountyDone?.bounty_id === dep.run.bounties.c1 && p.proposer === dep.volunteers.e);
  check("E (double RSVP): exactly one proposal on the shift (the second RSVP reverted)", eOwn.length === 1, eOwn.map((p) => p.id));
  const f = await proposal(dao, P.F);
  check("F (spoofed BountyDone for B): never executed, never rejected", f !== null && ["InProgress", "Expired"].includes(f.status) && f.proposer !== f.kind.BountyDone.receiver_id && !out(P.F), { status: f?.status, proposer: f?.proposer });

  if (P.G !== undefined) {
    const gp = await proposal(dao, P.G);
    const ga = await view<any>(tier, "attendance_of", { bounty_id: dep.run.bounties.c1, account: dep.volunteers.g });
    check("G (rotating door QR): self check-in attributed to the organiser, shift paid and credited", gp?.status === "Approved" && ga.in_by === dep.organisers[0] && ga.out_by === dep.organisers[0] && out(P.G) === "credited", { status: gp?.status, in_by: ga.in_by, credited: out(P.G) });
  }

  const who = dep.volunteers.a;
  const rebuilt = await rebuild(dao, tier, who);
  const rec = await view<any>(tier, "record_of", { account: who });
  check(`A's hours rebuilt from chain data match impact-tier's record`, rebuilt.shifts.length === rec.shifts && rebuilt.minutes === rec.minutes, { rebuilt: { shifts: rebuilt.shifts.length, minutes: rebuilt.minutes }, record: { shifts: rec.shifts, minutes: rec.minutes } });

  console.log(`\n${n - failed}/${n} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
