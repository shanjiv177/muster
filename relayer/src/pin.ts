// POST /pin: pins campaign metadata or a cover image to IPFS through Pinata.
//
// Only DAO organisers may pin. The request carries the organiser's account, the public key of
// their impact-tier check-in key, a timestamp, and an ed25519 signature over
// `muster-pin:<account>:<sha256(body) hex>:<timestamp>`. The relayer checks the signature, that
// the key is a FunctionCall key on that account for impact-tier, and that the account is in the
// DAO's organiser role. The Pinata JWT never leaves the server.
import { createHash } from "node:crypto";
import { PublicKey } from "near-api-js";
import { provider, view } from "../../scripts/lib/near.js";

export const MAX_BYTES = 2_000_000;
const TYPES = new Set(["application/json", "image/jpeg", "image/png", "image/webp"]);

export interface PinRequest {
  account: string;
  publicKey: string;
  timestamp: number; // ms
  signature: string; // base64
  name: string;
  contentType: string;
  data: string; // base64
}

export const pinMessage = (account: string, sha256hex: string, timestamp: number) => `muster-pin:${account}:${sha256hex}:${timestamp}`;

/** Static checks; returns a refusal reason or null. Pure, unit-tested. */
export function checkShape(r: PinRequest, bytes: Buffer, now = Date.now()): string | null {
  if (!r.account || !r.publicKey || !r.signature || !r.data) return "account, publicKey, signature and data are required";
  if (!TYPES.has(r.contentType)) return `content type ${r.contentType} not allowed`;
  if (bytes.length > MAX_BYTES) return "file larger than 2 MB";
  if (Math.abs(now - r.timestamp) > 5 * 60_000) return "signature timestamp too old";
  const msg = new TextEncoder().encode(pinMessage(r.account, createHash("sha256").update(bytes).digest("hex"), r.timestamp));
  try {
    if (!PublicKey.fromString(r.publicKey).verify(msg, Buffer.from(r.signature, "base64"))) return "bad signature";
  } catch {
    return "bad public key or signature";
  }
  return null;
}

/** On-chain checks: the key belongs to the account and is scoped to impact-tier; the account is an organiser. */
export async function checkOrganiser(r: PinRequest, dao: string, impactTier: string): Promise<string | null> {
  try {
    const ak: any = await provider.viewAccessKey({ accountId: r.account, publicKey: r.publicKey } as any);
    if (ak.permission?.FunctionCall?.receiver_id !== impactTier) return "key is not this account's impact-tier check-in key";
  } catch {
    return "key not found on this account";
  }
  const policy = await view<any>(dao, "get_policy");
  const orgs: string[] = policy.roles.find((x: any) => x.name === "organiser")?.kind?.Group ?? [];
  return orgs.includes(r.account) ? null : `${r.account} is not in the DAO's organiser role`;
}

export async function pinToPinata(jwt: string, name: string, contentType: string, bytes: Buffer): Promise<string> {
  const form = new FormData();
  form.append("network", "public");
  form.append("name", name.slice(0, 100));
  form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), name.slice(0, 100));
  const res = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.cid) throw new Error(`pinata ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.cid as string;
}
