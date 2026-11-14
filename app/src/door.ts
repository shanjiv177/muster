// Rotating door QR: a per-shift ed25519 key kept on the organiser's door screen.
import { KeyPair } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { DEP } from "./chain";

export const SLOT_SECS = 30;
export type Kind = "In" | "Out";
const keyName = (bountyId: number) => `muster:door:${DEP.impactTier}:${bountyId}`;

export function doorKey(bountyId: number): KeyPair {
  let k = localStorage.getItem(keyName(bountyId)) as KeyPairString | null;
  if (!k) {
    k = KeyPair.fromRandom("ed25519").toString() as KeyPairString;
    localStorage.setItem(keyName(bountyId), k);
  }
  return KeyPair.fromString(k);
}

export const currentSlot = () => Math.floor(Date.now() / 1000 / SLOT_SECS);

export function doorPayload(kp: KeyPair, bountyId: number, kind: Kind, slot = currentSlot()): string {
  const msg = new TextEncoder().encode(`muster-door:${DEP.impactTier}:${bountyId}:${slot}:${kind}`);
  const sig = kp.sign(msg).signature;
  return `muster-door:${bountyId}:${slot}:${kind}:${btoa(String.fromCharCode(...sig))}`;
}

export function parseDoor(text: string): { bounty_id: number; slot: number; kind: Kind; signature: string } | null {
  const m = /^muster-door:(\d+):(\d+):(In|Out):([A-Za-z0-9+/=]+)$/.exec(text.trim());
  return m ? { bounty_id: Number(m[1]), slot: Number(m[2]), kind: m[3] as Kind, signature: m[4] } : null;
}
