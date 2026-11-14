// Read-only chain access: every page reads the DAO and impact-tier directly. No backend.
import { JsonRpcProvider } from "near-api-js";
import dep from "../../deployments/testnet.json";

export const DEP = dep as {
  network: string; factory: string; dao: string; impactTier: string;
  council: string[]; organisers: string[]; volunteers: Record<string, string>;
  run: { at: string; bounties: Record<string, number>; proposals: Record<string, number> };
};
export const RPC = import.meta.env.VITE_RPC_URL ?? "https://rpc.testnet.fastnear.com";
export const RELAYER_URL: string | undefined = import.meta.env.VITE_RELAYER_URL || undefined;
export const EXPLORER = "https://testnet.nearblocks.io";
export const provider = new JsonRpcProvider({ url: RPC });

export const addrLink = (a: string) => `${EXPLORER}/address/${a}`;
export const txLink = (h: string) => `${EXPLORER}/txns/${h}`;

export async function view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

export interface Terms { start: number; end: number; min_minutes: number; grace_min: number }
export interface Campaign {
  id: number; title: string; place: string; amount: bigint; times: number; claims: number; terms: Terms | null; description: string;
}
export interface Proposal {
  id: number; proposer: string; description: string; status: string; kind: any;
  votes: Record<string, string>; submission_time: string;
}
export interface Attendance { in_ns: string | null; out_ns: string | null; in_by: string | null; out_by: string | null }
export interface Outcome { proposal_id: number; bounty_id: number; account: string; outcome: string; minutes: number; reason: string; at_ns: string }
export interface Record_ { shifts: number; minutes: number; entries: { proposal_id: number; bounty_id: number; minutes: number; approved_by: string }[] }

export function parseTerms(description: string): Terms | null {
  const line = description.split("\n").reverse().map((l) => l.trim()).find((l) => l.startsWith("MUSTER "));
  if (!line) return null;
  try { return JSON.parse(line.slice(7)); } catch { return null; }
}

export const yocto = (s: string | bigint) => BigInt(s);
export const nearStr = (y: bigint, dp = 2) => (Number(y) / 1e24).toFixed(dp);
export const toYocto = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;

export async function campaigns(): Promise<Campaign[]> {
  const raw = await view<any[]>(DEP.dao, "get_bounties", { from_index: 0, limit: 100 });
  return Promise.all(raw.map(async (b) => {
    const lines = String(b.description).split("\n");
    const claims = await view<number>(DEP.dao, "get_bounty_number_of_claims", { id: b.id }).catch(() => 0);
    return { id: b.id, title: lines[0], place: lines[1]?.startsWith("MUSTER") ? "" : lines[1] ?? "", amount: BigInt(b.amount), times: b.times, claims, terms: parseTerms(b.description), description: b.description };
  }));
}

export async function proposals(): Promise<Proposal[]> {
  const last = await view<number>(DEP.dao, "get_last_proposal_id");
  const out: Proposal[] = [];
  for (let from = 0; from < last; from += 100) out.push(...(await view<Proposal[]>(DEP.dao, "get_proposals", { from_index: from, limit: 100 })));
  return out;
}

export const bountyDone = (p: Proposal): { bounty_id: number; receiver_id: string } | null => p.kind?.BountyDone ?? null;
export const isSpoof = (p: Proposal) => { const bd = bountyDone(p); return !!bd && bd.receiver_id !== p.proposer; };

export async function outcomes(): Promise<Outcome[]> {
  const n = await view<number>(DEP.impactTier, "outcomes_count");
  const out: Outcome[] = [];
  for (let from = 0; from < n; from += 100) out.push(...(await view<Outcome[]>(DEP.impactTier, "outcomes", { from_index: from, limit: 100 })));
  return out;
}

export const attendanceOf = (bountyId: number, account: string) => view<Attendance>(DEP.impactTier, "attendance_of", { bounty_id: bountyId, account });
export const recordOf = (account: string) => view<Record_>(DEP.impactTier, "record_of", { account });
export const policy = () => view<any>(DEP.dao, "get_policy");
export const organisersOf = (pol: any): string[] => pol.roles.find((r: any) => r.name === "organiser")?.kind?.Group ?? [];

export function minutesOf(a: Attendance): number | null {
  if (!a.in_ns || !a.out_ns) return null;
  return Math.floor(Number(BigInt(a.out_ns) - BigInt(a.in_ns)) / 60e9);
}

export async function balanceOf(accountId: string): Promise<bigint> {
  const a: any = await provider.viewAccount({ accountId });
  return BigInt(a.amount);
}

export function fmtTime(sec: number) {
  return new Date(sec * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Rebuilds a volunteer's verified shifts from DAO proposals + attestations (same rule as scripts/verify.ts). */
export async function rebuild(account: string) {
  const [pol, props, camps] = await Promise.all([policy(), proposals(), campaigns()]);
  const orgs = organisersOf(pol);
  const shifts: { proposal: Proposal; campaign?: Campaign; minutes: number; att: Attendance }[] = [];
  for (const p of props) {
    const bd = bountyDone(p);
    if (!bd || bd.receiver_id !== account || p.proposer !== account || p.status !== "Approved") continue;
    const c = camps.find((x) => x.id === bd.bounty_id);
    const att = await attendanceOf(bd.bounty_id, account);
    const m = minutesOf(att);
    if (!c?.terms || m === null || !orgs.includes(att.in_by!) || !orgs.includes(att.out_by!) || m < c.terms.min_minutes) continue;
    shifts.push({ proposal: p, campaign: c, minutes: m, att });
  }
  return shifts;
}
