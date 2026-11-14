# Sputnik DAO v2: the facts Muster depends on

Read from `near-daos/sputnik-dao-contract`, branch `main`, on 2026-11-12. Line numbers are from that read and may drift. Before relying on any of them, check them against the deployed DAO's `version` (PLAN.md section 11, question 2).

Source files:
- [`sputnikdao2/src/bounties.rs`](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/bounties.rs)
- [`sputnikdao2/src/proposals.rs`](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/proposals.rs)
- [`sputnikdao2/src/policy.rs`](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/policy.rs)
- [`sputnikdao2/src/views.rs`](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/views.rs)

## Factories

| Network | Factory | DAOs listed by `get_dao_list` on 2026-11-12 |
|---|---|---|
| testnet | `sputnikv2.testnet` (current, default version [3,31]; `sputnik-v2.testnet` is an older deployment) | |
| mainnet | `sputnik-dao.near` | 2,141 |

## Bounties

**Bounty struct** (`bounties.rs` 25–37): `description: String`, `token: OldAccountId` (`""` for NEAR or a token contract id), `amount: U128`, `times: u32` ("How many times this bounty can be done"), `max_deadline: U64` ("Max deadline from claim that can be spend on this bounty").

**Creating a bounty** is an `AddBounty { bounty }` proposal. Its policy label is `add_bounty` (`proposals.rs` 136).

**`bounty_claim(id, deadline)`** (`bounties.rs` 97–122), payable:
- `assert_eq!(env::attached_deposit(), policy.bounty_bond, "ERR_BOUNTY_WRONG_BOND")`: the attached deposit must equal the DAO's bond exactly.
- `assert!(claims_count < bounty.times, "ERR_BOUNTY_ALL_CLAIMED")`.
- `assert!(deadline <= bounty.max_deadline, "ERR_BOUNTY_WRONG_DEADLINE")`.
- Records `BountyClaim { bounty_id, start_time: now, deadline, completed: false }` for the predecessor and adds the deposit to `locked_amount`.

**`bounty_done(id, account_id, description)`** (`bounties.rs` 149–177), payable:
- If `now > start_time + deadline`, the claim has expired. It is removed with nothing paid or returned, and anyone may call this to free the slot.
- Otherwise only the claimer may call it (`ERR_BOUNTY_DONE_MUST_BE_SELF`). It calls `add_proposal` with `ProposalKind::BountyDone { bounty_id, receiver_id }` and marks the claim completed. Policy label: `bounty_done` (`proposals.rs` 137).

**`bounty_giveup(id)`** (`bounties.rs` 179–198): within `bounty_forgiveness_period` of the claim, the bond is returned to the claimer; after it, nothing is returned. Either way the claim is removed.

**Payout on approval** (`proposals.rs` 427–430 → `bounties.rs` 65–84): `internal_execute_bounty_payout(bounty_id, receiver_id, true)` removes the claim and pays `amount` of `token` to the receiver.

**Bond return** (`proposals.rs` 339–349, `internal_return_bonds`): for a `BountyDone` proposal it transfers `policy.bounty_bond` to the proposal's proposer (the claimer), then returns the proposal bond. It is called when a proposal is approved (line 489). For a rejected proposal it is called when `return_bonds` is true (lines 505–509). Confirmed on testnet: Reject and finalised Expiry return the bond; only Remove keeps it. See [sputnik-findings.md](sputnik-findings.md).

## Proposals and voting

**`add_proposal(proposal: ProposalInput)`** (`proposals.rs` 535 on) validates the attached bond and checks that the caller has `<label>:AddProposal` permission (around line 572). `bounty_done` goes through this, so volunteers need `bounty_done:AddProposal`, for example through an `Everyone` role.

**`act_proposal(id, action, proposal, memo)`** (`proposals.rs` 594–599): `id: u64`, `action: Action`, `proposal: ProposalKind` (the caller must pass the kind, which is checked against the stored one), `memo: Option<String>`.

**Actions:** `AddProposal`, `RemoveProposal`, `VoteApprove`, `VoteReject`, `VoteRemove`, `Finalize`, `MoveToHub`. Permissions are strings `"<label>:<Action>"`, with `*` as a wildcard label (`policy.rs` 191–203).

**How a proposal passes** (`policy.rs`, `proposal_status`): if `submission_time + proposal_period` has passed, the proposal is `Expired`. Otherwise, for each role that may vote, the threshold is `max(quorum, threshold.to_weight(total_weight))`, where `total_weight` is the group size for `RoleWeight`. The first role whose approve count reaches its own threshold makes the proposal `Approved`. **So one role reaching its threshold is enough.** A one-member `tier` role with threshold weight 1 approves on its own vote, and so does one council vote under the same policy.

**Thresholds:** `WeightOrRatio::Weight(U128)` or `WeightOrRatio::Ratio(u64, NonZeroU64)` (`policy.rs` 91–101). Vote policy fields: `weight_kind`, `quorum`, `threshold`.

## Policy fields and defaults

`policy.rs` 153–165 and defaults at 211–213:

| Field | Type | Default |
|---|---|---|
| `roles` | `Vec<RolePermission { name, kind, permissions, vote_policy }>` | |
| `default_vote_policy` | `VotePolicy` | |
| `proposal_bond` | `NearToken` | 1 NEAR |
| `proposal_period` | `U64` (nanoseconds) | |
| `bounty_bond` | `NearToken` | 1 NEAR |
| `bounty_forgiveness_period` | `U64` (nanoseconds) | |

Role kinds: `Everyone`, `Group(Vec<AccountId>)`, `Member(U128)`. Vote policy is per proposal label per role; there are no amount-based tiers.

## View methods

From `views.rs`: `get_config`, `get_policy`, `get_proposal`, `get_proposals`, `get_last_proposal_id`, `get_bounty`, `get_bounties`, `get_last_bounty_id`, `get_bounty_claims`, `get_bounty_number_of_claims`, `get_available_amount`, `get_locked_storage_amount`, `get_actions_log`, `version`, plus delegation and staking views.

## Prior art that uses these mechanics

- `replaycourt/hat-tip`: a contract holding its own role that approves its own `Transfer` proposals 1-of-1.
- `emilhuseyn/patch-fund`: Sputnik bounties with earned trust, for open-source fixes.
