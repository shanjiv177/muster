// Testnet probe: confirms the Sputnik behaviours Muster depends on, on a throwaway DAO.
// Run: npm run probe            Output: tx links to paste into docs/sputnik-findings.md
import { account, balance, call, fmt, log, near, view, type TxResult } from "./lib/near.js";
import { act, addProposal, createDao, daoId, FACTORY, lastBountyId, lastProposalId, musterPolicy, proposal, rsvp } from "./lib/dao.js";

const NAME = process.env.PROBE_DAO ?? "muster-probe";
const dao = daoId(NAME);
const [c1, c2, org, tier] = ["muster-council-1", "muster-council-2", "muster-org", "muster-tier"].map((s) => `${s}.testnet`);
const vol = (x: string) => `muster-vol-${x}.testnet`;

function must<T extends TxResult>(label: string, r: T): T {
  log(label, r);
  if (!r.ok) throw new Error(`${label} failed`);
  return r;
}

async function delta(id: string, f: () => Promise<TxResult>) {
  const before = await balance(id);
  const r = await f();
  const after = await balance(id);
  return { r, d: after - before };
}

async function main() {
  console.log(`factory ${FACTORY}, default version`, await view(FACTORY, "get_default_version"));
  const exists = await view<string[]>(FACTORY, "get_dao_list").then((l) => l.includes(dao)).catch(() => false);
  if (!exists) {
    const policy = musterPolicy({
      council: [c1, c2], organisers: [org], tier,
      bountyBond: near(0.5), proposalBond: near(0.01),
      proposalPeriodSec: 86_400, forgivenessSec: 120,
    });
    must("create probe DAO", await createDao(account(c2), NAME, "Muster testnet probe", policy));
    must("fund DAO 2 NEAR", await account(c2).transfer({ receiverId: dao, amount: near(2) } as any).then((x: any) => ({ ok: true, hash: x.transaction.hash, link: "", logs: [] })));
  }
  console.log("dao", dao, "version", await view(dao, "version").catch(() => "n/a"));
  console.log("factory_info", JSON.stringify(await view(dao, "get_factory_info")));

  // Bounty: 0.1 NEAR, 10 slots, council majority (2 of 2).
  const add = must("AddBounty proposal", await addProposal(account(c1), dao, "probe shift", {
    AddBounty: { bounty: { description: "probe shift", token: "", amount: near(0.1).toString(), times: 10, max_deadline: (86_400n * 1_000_000_000n).toString() } },
  }));
  must("council-1 approve", await act(account(c1), dao, add.id!, "VoteApprove"));
  must("council-2 approve", await act(account(c2), dao, add.id!, "VoteApprove"));
  const bountyId = (await lastBountyId(dao)) - 1;
  console.log("bounty", bountyId, JSON.stringify(await view(dao, "get_bounty", { id: bountyId })));

  // (a) one-transaction RSVP
  const a = must("(a) vol-a batched claim+done", await rsvp(account(vol("a")), dao, bountyId, "rsvp"));
  const pA = (await lastProposalId(dao)) - 1;
  console.log("    proposal", pA, JSON.stringify((await proposal(dao, pA))?.kind), a.link);

  // (b1) Reject refunds the bond
  must("vol-b RSVP", await rsvp(account(vol("b")), dao, bountyId, "rsvp"));
  const pB = (await lastProposalId(dao)) - 1;
  const rej = await delta(vol("b"), () => act(account(c1), dao, pB, "VoteReject"));
  log(`(b1) council rejects vol-b; vol-b balance change ${fmt(rej.d)} NEAR`, rej.r);

  // (b2) Remove keeps the bond
  must("vol-c RSVP", await rsvp(account(vol("c")), dao, bountyId, "rsvp"));
  const pC = (await lastProposalId(dao)) - 1;
  const rem = await delta(vol("c"), () => act(account(tier), dao, pC, "VoteRemove"));
  log(`(b2) tier removes vol-c; vol-c balance change ${fmt(rem.d)} NEAR; proposal now ${JSON.stringify(await proposal(dao, pC))}`, rem.r);

  // (c) spoofed BountyDone for vol-d, rejected -> bond goes to the attacker (vol-e)
  must("vol-d RSVP", await rsvp(account(vol("d")), dao, bountyId, "rsvp"));
  const pD = (await lastProposalId(dao)) - 1;
  const spoof = must("vol-e files BountyDone{receiver: vol-d}", await addProposal(account(vol("e")), dao, "spoof", { BountyDone: { bounty_id: bountyId, receiver_id: vol("d") } }));
  const atk = await delta(vol("e"), () => act(account(c1), dao, spoof.id!, "VoteReject"));
  log(`(c) council rejects spoof; attacker vol-e balance change ${fmt(atk.d)} NEAR`, atk.r);
  const after = await act(account(tier), dao, pD, "VoteApprove");
  log("(c') tier approves vol-d's real proposal after the spoof was rejected (expect failure)", after);

  // Approve path: vol-a paid 0.1 and bond back
  const pay = await delta(vol("a"), () => act(account(tier), dao, pA, "VoteApprove"));
  log(`approve vol-a; vol-a balance change ${fmt(pay.d)} NEAR`, pay.r);

  // Defence order: vol-f RSVP, attacker spoofs, tier settles the real one first, then rejecting the spoof reverts.
  must("vol-f RSVP", await rsvp(account(vol("f")), dao, bountyId, "rsvp"));
  const pF = (await lastProposalId(dao)) - 1;
  const spoof2 = must("vol-e spoofs vol-f", await addProposal(account(vol("e")), dao, "spoof", { BountyDone: { bounty_id: bountyId, receiver_id: vol("f") } }));
  must("tier approves vol-f's real proposal first", await act(account(tier), dao, pF, "VoteApprove"));
  log("(c'') reject spoof after real one settled (expect failure)", await act(account(c1), dao, spoof2.id!, "VoteReject"));

  // (e) auto-update off via FactoryInfoUpdate
  const fi = must("FactoryInfoUpdate proposal", await addProposal(account(c1), dao, "Turn off factory auto-update", { FactoryInfoUpdate: { factory_info: { factory_id: FACTORY, auto_update: false } } }));
  must("council-1 approve", await act(account(c1), dao, fi.id!, "VoteApprove"));
  must("council-2 approve", await act(account(c2), dao, fi.id!, "VoteApprove"));
  console.log("factory_info after", JSON.stringify(await view(dao, "get_factory_info")));
  console.log("locked_amount-style views: available", await view(dao, "get_available_amount"));
}

main().catch((e) => { console.error(e); process.exit(1); });
