# scripts

TypeScript with near-api-js 7, run with `tsx`. Keys come from `~/.near-credentials/testnet`, never from the repo. Live ids are written to `config/testnet.json` (git-ignored) and `deployments/testnet.json` (committed).

| Command | Does |
|---|---|
| `npm run probe` | Creates a throwaway DAO and confirms the Sputnik behaviours in `docs/sputnik-findings.md` |
| `npm run bootstrap` | Creates the community DAO from `sputnikv2.testnet` with Muster's policy, deploys and initialises impact-tier, turns factory auto-update off, and adds the organiser's FunctionCall check-in key. Idempotent |
| `npm run simulate` | Scenarios A–F end to end on testnet, with real timed attendance (~7 min). Writes `docs/testnet-run.md` and `deployments/testnet.json` |
| `npm run keeper` | One pass: `settle` every open own-name `BountyDone`, and `credit` council-approved shifts |
| `npm run verify -- <account>` | Rebuilds a volunteer's hours from chain data and compares them with impact-tier's record |
| `npm run judge` | Read-only checks of the on-chain facts. No keys needed. Exit code 0 means every check passed |
| `npm run lock-tier` | Deletes every access key on impact-tier. Irreversible |
| `npm run balances` | Balances of all Muster testnet accounts |
| `npx tsx scripts/probes/delegate-deposit.ts` | Shows that the relayer pays deposits inside NEP-366 delegates |
| `npx tsx scripts/probes/relay-attest.ts <bounty> <volunteer> [In\|Out]` | Relays a check-in signed by the organiser's FunctionCall key |
