// config/testnet.json (git-ignored) holds the live ids written by bootstrap.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { KeyPair } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { NETWORK } from "./near.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATH = join(ROOT, "config", `${NETWORK}.json`);

export interface MusterConfig {
  network: string;
  factory: string;
  dao: string;
  impactTier: string;
  council: string[];
  organisers: string[];
  volunteers: Record<string, string>;
  sponsor: string;
  relayer?: string;
  organiserAttestKey?: string; // public key only; the private key stays in ~/.near-credentials
  autoCapNear: string;
  trustedAfter: number;
  campaigns?: Record<string, number>;
}

export function loadConfig(): MusterConfig {
  if (!existsSync(PATH)) throw new Error(`Missing ${PATH}: run npm run bootstrap first`);
  return JSON.parse(readFileSync(PATH, "utf8"));
}

export function saveConfig(c: MusterConfig) {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(c, null, 2) + "\n");
}

/** Saves a key in near-cli's legacy keychain format, outside the repo. `name` defaults to the account. */
export function saveKey(accountId: string, kp: KeyPair, name = accountId) {
  const dir = join(homedir(), ".near-credentials", NETWORK);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  return file;
}

export function loadNamedKey(name: string): KeyPairString | null {
  const file = join(homedir(), ".near-credentials", NETWORK, `${name}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")).private_key as KeyPairString) : null;
}
