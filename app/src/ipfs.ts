// Campaign metadata on IPFS: pinned through the relayer (organisers only), read from a gateway.
import { KeyPair } from "near-api-js";
import { RELAYER_URL } from "./chain";
import { scopedKey } from "./wallet";

export const GATEWAY = import.meta.env.VITE_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";
export const gatewayUrl = (uri: string) => GATEWAY + uri.replace(/^ipfs:\/\//, "");

export interface Meta { title: string; place: string; about?: string; cover?: string }

/** The `META ipfs://<cid>` line of a bounty description, if any. */
export function metaUri(description: string): string | null {
  const line = description.split("\n").map((l) => l.trim()).find((l) => l.startsWith("META ipfs://"));
  return line ? line.slice(5) : null;
}

const cache = new Map<string, Promise<Meta | null>>();
export function fetchMeta(uri: string): Promise<Meta | null> {
  if (!cache.has(uri)) cache.set(uri, fetch(gatewayUrl(uri)).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(uri)!;
}

async function sha256hex(bytes: Uint8Array) {
  const h = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/** Pins bytes via the relayer, signed with the organiser's check-in key. Returns ipfs://<cid>. */
export async function pin(organiser: string, name: string, contentType: string, bytes: Uint8Array): Promise<string> {
  if (!RELAYER_URL) throw new Error("No relayer configured, so files can't be pinned");
  const key = scopedKey(organiser);
  if (!key) throw new Error("Add a check-in key on the organiser page first; it signs uploads");
  const kp = KeyPair.fromString(key);
  const timestamp = Date.now();
  const msg = new TextEncoder().encode(`muster-pin:${organiser}:${await sha256hex(bytes)}:${timestamp}`);
  const res = await fetch(`${RELAYER_URL}/pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: organiser, publicKey: kp.getPublicKey().toString(), timestamp, signature: b64(kp.sign(msg).signature), name, contentType, data: b64(bytes) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(body.error ?? `pinning failed (${res.status})`);
  return body.uri as string;
}
