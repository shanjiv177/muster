// Prints the NEAR balance of every Muster testnet account.   npm run balances
import { balance, fmt } from "./lib/near.js";
import { loadConfig } from "./lib/config.js";

const cfg = loadConfig();
const ids = [cfg.dao, cfg.impactTier, ...cfg.council, ...cfg.organisers, cfg.relayer!, ...Object.values(cfg.volunteers), "muster-guest.testnet"];
for (const id of ids) console.log(id.padEnd(34), (await balance(id).then(fmt).catch(() => "missing")).padStart(10));
