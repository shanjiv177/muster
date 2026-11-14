// Sputnik DAO v2 helpers: policy builder, factory create, proposals and votes.
import type { Account } from "near-api-js";
import { call, fc, near, send, view, type TxResult } from "./near.js";

export const FACTORY = process.env.DAO_FACTORY ?? "sputnikv2.testnet";
const NS = 1_000_000_000n;

export interface PolicyParams {
  council: string[];
  organisers: string[];
  tier: string;
  bountyBond: bigint;
  proposalBond: bigint;
  proposalPeriodSec: number;
  forgivenessSec: number;
}

export function musterPolicy(p: PolicyParams) {
  const weight1 = { weight_kind: "RoleWeight", quorum: "0", threshold: "1" };
  return {
    roles: [
      {
        name: "council",
        kind: { Group: p.council },
        permissions: ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"],
        // One council vote settles a BountyDone (new volunteers); everything else needs a majority.
        vote_policy: { bounty_done: weight1 },
      },
      {
        name: "organiser",
        kind: { Group: p.organisers },
        permissions: ["add_bounty:AddProposal"],
        vote_policy: {},
      },
      {
        name: "tier",
        kind: { Group: [p.tier] },
        permissions: ["bounty_done:VoteApprove", "bounty_done:VoteRemove"],
        vote_policy: { bounty_done: weight1 },
      },
      {
        name: "volunteers",
        kind: "Everyone",
        permissions: ["bounty_done:AddProposal"],
        vote_policy: {},
      },
    ],
    default_vote_policy: { weight_kind: "RoleWeight", quorum: "0", threshold: [1, 2] },
    proposal_bond: p.proposalBond.toString(),
    proposal_period: (BigInt(p.proposalPeriodSec) * NS).toString(),
    bounty_bond: p.bountyBond.toString(),
    bounty_forgiveness_period: (BigInt(p.forgivenessSec) * NS).toString(),
  };
}

export async function createDao(signer: Account, name: string, purpose: string, policy: object, deposit = near(6)) {
  const args = { config: { name, purpose, metadata: "" }, policy };
  const b64 = Buffer.from(JSON.stringify(args)).toString("base64");
  return call(signer, FACTORY, "create", { name, args: b64 }, 300, deposit);
}

export const daoId = (name: string) => `${name}.${FACTORY}`;

export async function policyOf(dao: string) {
  return view<any>(dao, "get_policy");
}

export async function addProposal(signer: Account, dao: string, description: string, kind: object): Promise<TxResult & { id?: number }> {
  const policy = await policyOf(dao);
  const r = await call(signer, dao, "add_proposal", { proposal: { description, kind } }, 100, BigInt(policy.proposal_bond));
  return { ...r, id: typeof r.value === "number" ? r.value : undefined };
}

export type Action = "VoteApprove" | "VoteReject" | "VoteRemove" | "Finalize" | "RemoveProposal";

export async function act(signer: Account, dao: string, id: number, action: Action, memo?: string) {
  const p = await view<any>(dao, "get_proposal", { id });
  return call(signer, dao, "act_proposal", { id, action, proposal: p.kind, memo }, 200);
}

/** Muster RSVP: claim the bounty and file its BountyDone in one transaction. */
export async function rsvp(signer: Account, dao: string, bountyId: number, description: string, deadlineSec = 86_400) {
  const policy = await policyOf(dao);
  return send(signer, dao, [
    fc("bounty_claim", { id: bountyId, deadline: (BigInt(deadlineSec) * NS).toString() }, 50, BigInt(policy.bounty_bond)),
    fc("bounty_done", { id: bountyId, description }, 100, BigInt(policy.proposal_bond)),
  ]);
}

export async function lastProposalId(dao: string): Promise<number> {
  return view<number>(dao, "get_last_proposal_id");
}

export async function lastBountyId(dao: string): Promise<number> {
  return view<number>(dao, "get_last_bounty_id");
}

export async function proposal(dao: string, id: number): Promise<any | null> {
  // Removed proposals are deleted from state; a range query returns [] instead of panicking.
  const [p] = await view<any[]>(dao, "get_proposals", { from_index: id, limit: 1 });
  return p && p.id === id ? p : null;
}
