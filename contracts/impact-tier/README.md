# impact-tier

The rules contract for one Muster community. It holds the DAO's `tier` role, which may only `VoteApprove` and `VoteRemove` on `bounty_done` proposals. It has no owner, and after deployment all of its access keys are deleted (`npm run lock-tier`).

| Method | Caller | What it does |
|---|---|---|
| `new(dao, auto_cap, trusted_after)` | deployer (init) | Sets the DAO, the largest stipend it may approve alone, and the number of verified shifts before a volunteer is trusted |
| `attest(bounty_id, volunteer, kind)` | an account in the DAO's `organiser` role, usually through its FunctionCall key | Reads `get_policy`. If the caller is an organiser, records `In` or `Out` at the block time |
| `settle(proposal_id, bounty_id, account)` | anyone | Joint promise of `get_proposal`, `get_bounty`, `get_policy` and `get_bounty_claims`, then `decide()`. Approve: votes `VoteApprove` and credits the record. Remove: votes `VoteRemove`. Otherwise waits |
| `credit(proposal_id, bounty_id)` | anyone | Adds a council-approved, organiser-attested shift to the record, once |
| `record_of`, `attendance_of`, `outcomes`, `outcomes_count`, `is_credited`, `canonical_of`, `get_config`, `storage_headroom` | view | |

## Decision rules (`src/decide.rs`)

1. Only `BountyDone` proposals that are `InProgress`, for the bounty the caller named, are considered.
2. If proposer ≠ receiver, it is a spoof: **Ignore** (see `docs/sputnik-findings.md` §3).
3. If the volunteer has no live claim on the bounty (given up, or already settled): **Ignore**.
4. If another proposal for the same (bounty, volunteer) was settled first: **Remove** as a duplicate.
5. If the bounty has no `MUSTER {...}` terms: **Ignore**.
6. If both check-in and check-out were made by organisers and the shift lasted at least `min_minutes`:
   - **Approve** when the volunteer has at least `trusted_after` shifts and the stipend is at most `auto_cap`;
   - otherwise **Wait** for the council.
7. After `end + grace`:
   - no attendance at all: **Remove** (the bond stays in the DAO);
   - partial attendance: **Wait** for the council.
8. Otherwise **Wait**.

## Invariants, each covered by a unit test

- Votes only on in-progress `BountyDone` proposals.
- Never files a proposal.
- Never votes on a proposal where proposer ≠ receiver.
- Never removes a volunteer whose attendance was attested in full.
- Never approves without attestations from organisers.
- Credits each proposal at most once.
- Fails closed when a DAO read fails.

```bash
cargo test                                   # 34 tests
cargo near build non-reproducible-wasm       # target/near/impact_tier.wasm
```
