// Deletes every access key on the impact-tier account, so nobody can change its code or state
// except through its own methods. Irreversible.   npm run lock-tier
import { account, provider } from "./lib/near.js";
import { loadConfig } from "./lib/config.js";

async function main() {
  const cfg = loadConfig();
  const keys: any = await provider.viewAccessKeyList({ accountId: cfg.impactTier } as any);
  const list = keys.keys ?? [];
  if (!list.length) return console.log(`${cfg.impactTier} is already locked (0 access keys)`);
  const a = account(cfg.impactTier);
  for (const k of list) {
    const r: any = await a.deleteKey(k.public_key);
    console.log(`deleted ${k.public_key}  https://testnet.nearblocks.io/txns/${r.transaction.hash}`);
  }
  const after: any = await provider.viewAccessKeyList({ accountId: cfg.impactTier } as any);
  console.log(`${cfg.impactTier} access keys now: ${after.keys.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
