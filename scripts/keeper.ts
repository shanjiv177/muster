// Keeper: settle open shift proposals and credit council-approved ones. Anyone can run it.
//   npm run keeper                                   one pass, keys from ~/.near-credentials
//   KEEPER_LOOP_SECONDS=60 npm run keeper            loop
// Hosted: KEEPER_ACCOUNT + KEEPER_PRIVATE_KEY (a FunctionCall key for impact-tier settle/credit);
// ids come from deployments/testnet.json when config/testnet.json is absent.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyPairString } from "near-api-js";
import { ROOT, loadConfig, type MusterConfig } from "./lib/config.js";
import { keeperPass } from "./lib/muster.js";
import { account, sleep } from "./lib/near.js";

function config(): MusterConfig {
  if (existsSync(join(ROOT, "config", "testnet.json"))) return loadConfig();
  const dep = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet.json"), "utf8"));
  return { ...dep, sponsor: "", autoCapNear: "", trustedAfter: 0, relayer: process.env.KEEPER_ACCOUNT };
}

const cfg = config();
const signer = process.env.KEEPER_PRIVATE_KEY ? account(process.env.KEEPER_ACCOUNT!, process.env.KEEPER_PRIVATE_KEY as KeyPairString) : undefined;
const every = Number(process.env.KEEPER_LOOP_SECONDS ?? 0);
do {
  try {
    const done = await keeperPass(cfg, false, signer);
    console.log(`${new Date().toISOString()} keeper pass: ${done.length} call(s)`);
  } catch (e) {
    console.error(`${new Date().toISOString()} keeper pass failed:`, String(e).slice(0, 300));
  }
  if (every) await sleep(every * 1000);
} while (every);
