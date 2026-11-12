# relayer

**Status: not started.**

A NEP-366 meta-transaction relayer that pays gas for volunteers' signed delegate actions. It accepts only these calls on the configured community DAO:

- `bounty_claim`
- `bounty_done`
- `bounty_giveup`

It never pays attached deposits. The RSVP bond must come from the volunteer, or a no-show would lose nothing (see [PLAN.md section 8](../PLAN.md#8-bond-policy)).

Reference: https://docs.near.org/web3-apps/tutorials/meta-transactions
