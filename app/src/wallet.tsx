// Wallet selector (MyNearWallet, Meteor) plus a scoped browser key for organiser check-ins.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import "@near-wallet-selector/modal-ui/styles.css";
import { actionCreators } from "@near-js/transactions";
import { PublicKey } from "@near-js/crypto";
import { Account, KeyPair, encodeSignedDelegate, actions as najActions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { DEP, RELAYER_URL, provider } from "./chain";

interface WalletCtx {
  selector?: WalletSelector;
  modal?: WalletSelectorModal;
  accountId: string | null;
}
const Ctx = createContext<WalletCtx>({ accountId: null });
export const useWallet = () => useContext(Ctx);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletCtx>({ accountId: null });
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const selector = await setupWalletSelector({ network: "testnet", modules: [setupMyNearWallet(), setupMeteorWallet()] });
      const modal = setupModal(selector, { contractId: DEP.dao, description: "Sign in to RSVP, check volunteers in, or vote as council." });
      const current = () => selector.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
      setState({ selector, modal, accountId: current() });
      const sub = selector.store.observable.subscribe(() => setState((s) => ({ ...s, accountId: current() })));
      unsub = () => sub.unsubscribe();
    })();
    return () => unsub?.();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export interface Call { method: string; args: object; tgas: number; deposit?: bigint }

/** Sends one transaction with one or more function calls through the user's wallet. */
export async function walletCall(w: WalletCtx, receiverId: string, calls: Call[]) {
  if (!w.selector || !w.accountId) throw new Error("Sign in first");
  const wallet = await w.selector.wallet();
  const acts = calls.map((c) => actionCreators.functionCall(c.method, c.args, BigInt(c.tgas) * 10n ** 12n, c.deposit ?? 0n));
  return wallet.signAndSendTransaction({ receiverId, actions: acts as any });
}

export function outcomeHash(o: any): string | undefined {
  return o?.transaction?.hash ?? o?.transaction_outcome?.id;
}

export function outcomeError(o: any): string | undefined {
  for (const r of o?.receipts_outcome ?? []) if (r.outcome?.status?.Failure) return JSON.stringify(r.outcome.status.Failure).slice(0, 240);
  return o?.status?.Failure ? JSON.stringify(o.status.Failure).slice(0, 240) : undefined;
}

// ---------- organiser's scoped check-in key ----------

const keyName = (account: string) => `muster:attest-key:${DEP.impactTier}:${account}`;

export function scopedKey(account: string): KeyPairString | null {
  return (localStorage.getItem(keyName(account)) as KeyPairString | null) ?? null;
}

/** Is the stored scoped key registered on chain as a FunctionCall key for impact-tier `attest`? */
export async function scopedKeyActive(account: string): Promise<boolean> {
  const k = scopedKey(account);
  if (!k) return false;
  try {
    const ak: any = await provider.viewAccessKey({ accountId: account, publicKey: KeyPair.fromString(k).getPublicKey().toString() } as any);
    const fc = ak.permission?.FunctionCall;
    return !!fc && fc.receiver_id === DEP.impactTier;
  } catch {
    return false;
  }
}

/** Generates a browser key and asks the wallet to add it, limited to impact-tier `attest`. */
export async function addScopedKey(w: WalletCtx) {
  if (!w.selector || !w.accountId) throw new Error("Sign in first");
  const kp = KeyPair.fromRandom("ed25519");
  localStorage.setItem(keyName(w.accountId), kp.toString());
  const wallet = await w.selector.wallet();
  const act = actionCreators.addKey(
    PublicKey.fromString(kp.getPublicKey().toString()),
    actionCreators.functionCallAccessKey(DEP.impactTier, ["attest"], 250_000_000_000_000_000_000_000n),
  );
  return wallet.signAndSendTransaction({ receiverId: w.accountId, actions: [act as any] });
}

/**
 * Check-in with the scoped key: no wallet pop-up. With a relayer configured, the key signs a
 * NEP-366 delegate action and the relayer pays gas; otherwise it sends a normal transaction.
 */
export async function attestWithScopedKey(organiser: string, bountyId: number, volunteer: string, kind: "In" | "Out") {
  const key = scopedKey(organiser);
  if (!key) throw new Error("No check-in key on this device");
  const acct = new Account(organiser, provider, key);
  const act = najActions.functionCall("attest", { bounty_id: bountyId, volunteer, kind }, 60n * 10n ** 12n, 0n);
  if (RELAYER_URL) {
    const { signedDelegate } = await acct.createSignedMetaTransaction({ receiverId: DEP.impactTier, actions: [act], blockHeightTtl: 120 } as any);
    const b64 = btoa(String.fromCharCode(...encodeSignedDelegate(signedDelegate)));
    const res = await fetch(`${RELAYER_URL}/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signedDelegate: b64 }) });
    const body = await res.json();
    if (!body.ok) throw new Error(body.error ?? `relayer ${res.status}`);
    return { hash: body.hash as string, via: "relayer" };
  }
  const res: any = await acct.signAndSendTransaction({ receiverId: DEP.impactTier, actions: [act], throwOnFailure: false, waitUntil: "FINAL" } as any);
  const err = outcomeError(res);
  if (err) throw new Error(err.includes("ERR_NOT_ORGANISER") ? "This account is not in the DAO's organiser role" : err);
  return { hash: outcomeHash(res)!, via: "direct" };
}
