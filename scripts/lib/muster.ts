// Muster operations shared by campaign, simulate, keeper and judge.
import type { Account } from "near-api-js";
import { account, call, log, near, view, type TxResult } from "./near.js";
import { act, addProposal, lastBountyId, lastProposalId } from "./dao.js";
import { loadNamedKey, type MusterConfig } from "./config.js";

export interface Terms { start: number; end: number; min_minutes: number; grace_min: number }

export function describe(title: string, place: string, t: Terms): string {
  const when = new Date(t.start * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return `${title}\n${place} · ${when}\nMUSTER ${JSON.stringify(t)}`;
}

export function parseTerms(description: string): Terms | null {
  const line = description.split("\n").reverse().map((l) => l.trim()).find((l) => l.startsWith("MUSTER "));
  if (!line) return null;
  try { return JSON.parse(line.slice(7)); } catch { return null; }
}

/** Organiser files AddBounty with MUSTER terms; both council members approve. Returns the bounty id. */
export async function createCampaign(cfg: MusterConfig, o: { title: string; place: string; terms: Terms; slots: number; stipendNear: string }) {
  const bounty = {
    description: describe(o.title, o.place, o.terms),
    token: "",
    amount: near(o.stipendNear).toString(),
    times: o.slots,
    max_deadline: (14n * 86_400n * 1_000_000_000n).toString(),
  };
  const p = await addProposal(account(cfg.organisers[0]), cfg.dao, `Campaign: ${o.title}`, { AddBounty: { bounty } });
  log(`organiser proposes campaign "${o.title}"`, p);
  if (!p.ok) throw new Error(p.error);
  for (const c of cfg.council) log(`  ${c} approves`, await act(account(c), cfg.dao, p.id!, "VoteApprove"));
  const id = (await lastBountyId(cfg.dao)) - 1;
  return { bountyId: id, proposalId: p.id!, tx: p };
}

/** The organiser's scoped (FunctionCall-only) key, as created by bootstrap. */
export function organiserScoped(cfg: MusterConfig): Account {
  const key = loadNamedKey(`${cfg.organisers[0]}.attest.${cfg.impactTier}`);
  if (!key) throw new Error("organiser scoped key missing: run bootstrap");
  return account(cfg.organisers[0], key);
}

export async function attest(cfg: MusterConfig, bountyId: number, volunteer: string, kind: "In" | "Out", signer = organiserScoped(cfg)) {
  return call(signer, cfg.impactTier, "attest", { bounty_id: bountyId, volunteer, kind }, 60);
}

export async function settle(cfg: MusterConfig, proposalId: number, bountyId: number, receiver: string, signer?: Account) {
  return call(signer ?? account(cfg.relayer!), cfg.impactTier, "settle", { proposal_id: proposalId, bounty_id: bountyId, account: receiver }, 300);
}

export async function credit(cfg: MusterConfig, proposalId: number, bountyId: number, signer?: Account) {
  return call(signer ?? account(cfg.relayer!), cfg.impactTier, "credit", { proposal_id: proposalId, bounty_id: bountyId }, 150);
}

export async function allProposals(dao: string): Promise<any[]> {
  const last = await lastProposalId(dao);
  const out: any[] = [];
  for (let from = 0; from < last; from += 100) out.push(...(await view<any[]>(dao, "get_proposals", { from_index: from, limit: 100 })));
  return out;
}

export function bountyDoneOf(p: any): { bounty_id: number; receiver_id: string } | null {
  return p?.kind?.BountyDone ?? null;
}

/** One keeper pass: settle every open own-name BountyDone, credit council-approved ones. */
export async function keeperPass(cfg: MusterConfig, quiet = false): Promise<{ id: number; action: string; r: TxResult }[]> {
  const done: { id: number; action: string; r: TxResult }[] = [];
  for (const p of await allProposals(cfg.dao)) {
    const bd = bountyDoneOf(p);
    if (!bd || p.proposer !== bd.receiver_id) continue;
    if (p.status === "InProgress") {
      // Skip proposals whose claim is gone (given up): there is nothing left to vote on.
      const claims = await view<any[]>(cfg.dao, "get_bounty_claims", { account_id: bd.receiver_id });
      if (!claims.some((c) => c.bounty_id === bd.bounty_id)) continue;
      const r = await settle(cfg, p.id, bd.bounty_id, bd.receiver_id);
      done.push({ id: p.id, action: "settle", r });
      if (!quiet) log(`settle #${p.id} (${bd.receiver_id}) -> ${JSON.stringify(r.value)}`, r);
    } else if (p.status === "Approved" && !(await view<boolean>(cfg.impactTier, "is_credited", { proposal_id: p.id }))) {
      const attended = await view<any>(cfg.impactTier, "attendance_of", { bounty_id: bd.bounty_id, account: bd.receiver_id });
      if (!attended.out_ns) continue;
      const r = await credit(cfg, p.id, bd.bounty_id);
      done.push({ id: p.id, action: "credit", r });
      if (!quiet) log(`credit #${p.id} (${bd.receiver_id}) -> ${JSON.stringify(r.value)}`, r);
    }
  }
  return done;
}
