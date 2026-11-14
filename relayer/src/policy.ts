// What the Muster relayer will pay gas for. Pure, so it is unit-testable.
//
// NEP-366 makes the *relayer* pay any deposit attached inside a delegate action (confirmed on
// testnet, docs/sputnik-findings.md §6). So the relayer refuses every action with a deposit:
// bonds must always be the volunteer's own money, or a no-show would lose nothing.

export interface Allowlist {
  dao: string;
  impactTier: string;
  maxGas: bigint;
  maxActions: number;
}

export const METHODS = (a: Allowlist): Record<string, string[]> => ({
  [a.impactTier]: ["attest", "set_door_key", "self_attest", "settle", "credit"],
  [a.dao]: ["bounty_giveup"],
});

export interface DelegateLike {
  senderId: string;
  receiverId: string;
  actions: any[];
}

/** Returns null if allowed, else the reason for refusal. */
export function refuse(d: DelegateLike, a: Allowlist): string | null {
  const allowed = METHODS(a)[d.receiverId];
  if (!allowed) return `receiver ${d.receiverId} not allowed`;
  if (!d.actions.length || d.actions.length > a.maxActions) return "bad action count";
  for (const act of d.actions) {
    const fc = act.functionCall;
    if (!fc) return `only function calls are relayed (got ${Object.keys(act)[0]})`;
    if (!allowed.includes(fc.methodName)) return `method ${fc.methodName} not allowed on ${d.receiverId}`;
    if (BigInt(fc.deposit ?? 0) !== 0n) return "actions with a deposit are never relayed: the relayer would pay it";
    if (BigInt(fc.gas ?? 0) > a.maxGas) return "too much gas";
  }
  return null;
}

/** Fixed-window rate limit per sender. */
export class RateLimit {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(private max: number, private windowMs: number) {}
  take(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start > this.windowMs) {
      this.hits.set(key, { start: now, n: 1 });
      return true;
    }
    if (h.n >= this.max) return false;
    h.n++;
    return true;
  }
}
