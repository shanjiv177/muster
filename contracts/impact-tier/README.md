# impact-tier

**Status: not started.**

A Rust (near-sdk 5.x) contract that holds the `tier` role in one community DAO. When a volunteer files `bounty_done` with a valid check-in code and already has a verified record, anyone can call `try_approve(proposal_id)`. The contract reads the proposal from the DAO, checks the code's organiser signature with `env::ed25519_verify` and its time window, checks the volunteer's record, and votes `VoteApprove` with `act_proposal(id, action, kind, memo)`.

It votes only on `BountyDone` proposals and never files proposals. Full spec: [PLAN.md section 4](../../PLAN.md#4-contract-spec-impact-tier).

Planned interface:

| Method | Caller |
|---|---|
| `new(dao, owner, organiser_keys, min_record, code_window_minutes)` | deployer |
| `configure(organiser_keys, min_record, code_window_minutes)` | owner |
| `try_approve(proposal_id)` | anyone |
| `credit(proposal_id)` | anyone, after approval |
| `record_of(account)` | view |

Tests: unit tests for every invariant in PLAN.md section 4, and a sandbox test against the real Sputnik v2 wasm.
