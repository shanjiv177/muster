// Shared NEAR helpers for Muster scripts. Keys come from ~/.near-credentials
// (written by near-cli-rs `save-to-legacy-keychain`); nothing secret lives in the repo.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, FailoverRpcProvider, JsonRpcProvider, actions, nearToYocto, teraToGas } from "near-api-js";
import type { KeyPairString } from "near-api-js";

export const NETWORK = process.env.NEAR_NETWORK ?? "testnet";
export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
export const EXPLORER = "https://testnet.nearblocks.io";

// Failover across public testnet RPCs with backoff: free endpoints rate-limit bursts (HTTP 429).
const RPCS = [RPC_URL, "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://rpc.testnet.near.org"];
export const provider = new FailoverRpcProvider(
  [...new Set(RPCS)].map((url) => new JsonRpcProvider({ url }, { retries: 6, wait: 700, backoff: 1.6 })),
) as unknown as JsonRpcProvider;

export function credentialPath(accountId: string): string {
  return join(homedir(), ".near-credentials", NETWORK, `${accountId}.json`);
}

export function privateKeyOf(accountId: string): KeyPairString {
  const path = credentialPath(accountId);
  if (!existsSync(path)) throw new Error(`No key for ${accountId} at ${path}`);
  return JSON.parse(readFileSync(path, "utf8")).private_key as KeyPairString;
}

export function account(accountId: string, key?: KeyPairString): Account {
  return new Account(accountId, provider, key ?? privateKeyOf(accountId));
}

export async function view<T = any>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await provider.callFunction({ contractId, method, args })) as T;
}

export async function accountExists(accountId: string): Promise<boolean> {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}

export const near = (n: number | string) => BigInt(nearToYocto(String(n) as any));
export const tgas = (n: number) => BigInt(teraToGas(String(n) as any));
export const fc = (method: string, args: object, gasT = 30, deposit: bigint = 0n) =>
  actions.functionCall(method, args, tgas(gasT), deposit);

export interface TxResult {
  hash: string;
  ok: boolean;
  /** First failure anywhere in the receipt tree (detached promises included). */
  error?: string;
  value?: any;
  logs: string[];
  link: string;
}

export function link(hash: string): string {
  return `${EXPLORER}/txns/${hash}`;
}

function failureText(f: any): string {
  const s = JSON.stringify(f);
  const m = s.match(/"(?:ExecutionError|panic_msg|PanicMsg)"\s*:\s*"([^"]+)"/);
  return m ? m[1] : s.slice(0, 300);
}

export function summarize(res: any): TxResult {
  const hash: string = res.transaction?.hash ?? res.transaction_outcome?.id;
  const logs: string[] = [];
  let error: string | undefined;
  for (const r of res.receipts_outcome ?? []) {
    logs.push(...(r.outcome.logs ?? []));
    if (!error && r.outcome.status?.Failure) error = failureText(r.outcome.status.Failure);
  }
  if (!error && res.status?.Failure) error = failureText(res.status.Failure);
  let value: any;
  const sv = res.status?.SuccessValue;
  if (sv) {
    const txt = Buffer.from(sv, "base64").toString();
    try { value = JSON.parse(txt); } catch { value = txt; }
  }
  return { hash, ok: !error, error, value, logs, link: link(hash) };
}

export async function send(signer: Account, receiverId: string, acts: any[]): Promise<TxResult> {
  const res = await signer.signAndSendTransaction({
    receiverId,
    actions: acts,
    throwOnFailure: false,
    waitUntil: "FINAL",
  } as any);
  return summarize(res);
}

export async function call(signer: Account, receiverId: string, method: string, args: object, gasT = 30, deposit: bigint = 0n) {
  return send(signer, receiverId, [fc(method, args, gasT, deposit)]);
}

export function log(label: string, r: TxResult) {
  console.log(`${r.ok ? "ok  " : "FAIL"} ${label}  ${r.link}${r.error ? `\n     error: ${r.error}` : ""}`);
}

export async function balance(accountId: string): Promise<bigint> {
  const a: any = await provider.viewAccount({ accountId });
  return BigInt(a.amount);
}

export const fmt = (y: bigint) => (Number(y) / 1e24).toFixed(4);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
