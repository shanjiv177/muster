// One keeper pass: settle open shift proposals and credit council-approved ones. Anyone can run it.
//   npm run keeper            (loop: KEEPER_LOOP_SECONDS=60 npm run keeper)
import { loadConfig } from "./lib/config.js";
import { keeperPass } from "./lib/muster.js";
import { sleep } from "./lib/near.js";

const cfg = loadConfig();
const every = Number(process.env.KEEPER_LOOP_SECONDS ?? 0);
do {
  const done = await keeperPass(cfg);
  console.log(`${new Date().toISOString()} keeper pass: ${done.length} call(s)`);
  if (every) await sleep(every * 1000);
} while (every);
