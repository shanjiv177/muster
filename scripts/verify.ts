// Rebuilds a volunteer's verified hours from the chain alone and compares them with impact-tier's record.
//   npm run verify -- muster-vol-a.testnet
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { link, view } from "./lib/near.js";
import { ROOT } from "./lib/config.js";
import { allProposals, bountyDoneOf, parseTerms } from "./lib/muster.js";

export interface Shift { proposal_id: number; bounty_id: number; title: string; minutes: number; in_by: string; out_by: string }

export async function rebuild(dao: string, tier: string, who: string): Promise<{ shifts: Shift[]; minutes: number }> {
  const policy = await view<any>(dao, "get_policy");
  const organisers: string[] = policy.roles.find((r: any) => r.name === "organiser")?.kind?.Group ?? [];
  const shifts: Shift[] = [];
  for (const p of await allProposals(dao)) {
    const bd = bountyDoneOf(p);
    if (!bd || bd.receiver_id !== who || p.proposer !== who || p.status !== "Approved") continue;
    const bounty = await view<any>(dao, "get_bounty", { id: bd.bounty_id });
    const terms = parseTerms(bounty.description);
    const a = await view<any>(tier, "attendance_of", { bounty_id: bd.bounty_id, account: who });
    if (!terms || !a.in_ns || !a.out_ns || !organisers.includes(a.in_by) || !organisers.includes(a.out_by)) continue;
    const minutes = Math.floor((Number(BigInt(a.out_ns) - BigInt(a.in_ns)) / 60e9));
    if (minutes < terms.min_minutes) continue;
    shifts.push({ proposal_id: p.id, bounty_id: bd.bounty_id, title: bounty.description.split("\n")[0], minutes, in_by: a.in_by, out_by: a.out_by });
  }
  return { shifts, minutes: shifts.reduce((s, x) => s + x.minutes, 0) };
}

async function main() {
  const who = process.argv[2];
  if (!who) throw new Error("usage: npm run verify -- <account>");
  const dep = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet.json"), "utf8"));
  const { shifts, minutes } = await rebuild(dep.dao, dep.impactTier, who);
  console.log(`Verified hours for ${who} in ${dep.dao}`);
  for (const s of shifts) console.log(`  #${s.proposal_id}  ${s.title}  ${s.minutes} min  attested by ${s.in_by}`);
  console.log(`  total: ${shifts.length} shifts, ${minutes} min`);
  const rec = await view<any>(dep.impactTier, "record_of", { account: who });
  const match = rec.shifts === shifts.length && rec.minutes === minutes;
  console.log(`impact-tier record: ${rec.shifts} shifts, ${rec.minutes} min -> ${match ? "MATCH" : "MISMATCH"}`);
  console.log(`DAO: ${link("").replace("/txns/", "/address/")}${dep.dao}`);
  process.exit(match ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
