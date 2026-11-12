# scripts

**Status: not started.**

TypeScript with `near-api-js`. Each script reads `.env`, and writes or reads account ids in `config/testnet.json`.

| Script | Does |
|---|---|
| `bootstrap.ts` | Creates the community DAO from `sputnik-v2.testnet` with Muster's policy, deploys `impact-tier`, and registers the organiser's check-in key |
| `fund.ts` | Sends test tokens to the DAO |
| `campaign.ts` | Files and approves an `AddBounty` proposal |
| `simulate.ts` | Four volunteers: one auto-approved, one council-approved, one no-show, one give-up |
| `fast-forward.ts` | Clears expired claims, so their bonds stay in the DAO |
| `forge.ts` | Submits a check-in signed by the wrong key; expects no vote |

Details: [PLAN.md section 6](../PLAN.md#6-scripts).
