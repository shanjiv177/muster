# Sputnik DAO v2 findings, confirmed on testnet

Probe DAO: [`muster-probe.sputnikv2.testnet`](https://testnet.nearblocks.io/address/muster-probe.sputnikv2.testnet). It was created on 2026-11-14 from factory `sputnikv2.testnet`, whose `get_default_version` returns `[3, 31]`. The DAO's own `version()` returns `2.3.1`. Reproduce with `npm run probe` (set `PROBE_DAO` to a new name).

Policy: `bounty_bond` 0.5 NEAR, `proposal_bond` 0.01 NEAR, and the Muster roles (`scripts/lib/dao.ts`, `musterPolicy`). The bounty pays 0.1 NEAR and has 10 slots.

The old factory `sputnik-v2.testnet` (with a dash) is not current: it has no `get_default_code_hash` or `get_default_version`. Muster uses `sputnikv2.testnet`.

## 1. RSVP is one transaction

`bounty_claim` (bond attached) and `bounty_done` (proposal bond attached) can be batched in one transaction to the DAO. Together they file `BountyDone{bounty_id: 0, receiver_id: muster-vol-a.testnet}` under the volunteer's own name.
- [tx](https://testnet.nearblocks.io/txns/8bfvedmDr4xRRnmf69GrUtxbiPXbk3oe58yoCweoSWMP)

## 2. Only VoteRemove forfeits the bond

| Outcome | Who | Volunteer's balance change | tx |
|---|---|---|---|
| Rejected | one council vote | **+0.51 NEAR** (bond and proposal bond refunded) | [DgWW…](https://testnet.nearblocks.io/txns/DgWWr7UPQP1cbcRyZr2CJZMRcYrNvUJiXBjB9VMTcgKw) |
| Removed | `tier` role, one vote | **0** (0.51 NEAR stays in the DAO; the proposal is deleted) | [HjEX…](https://testnet.nearblocks.io/txns/HjEXa5nceb9zZZMGwDEcHVfkzwj7SZaKwriBi6PoLW66) |
| Approved | `tier` role, one vote | **+0.61 NEAR** (0.1 stipend plus 0.51 in bonds) | [GR8Y…](https://testnet.nearblocks.io/txns/GR8YFosGwacAPChiURfx37GD76uTVqAU4XNTEnZdkfAf) |

Source: `act_proposal` calls `internal_reject_proposal(.., true)` on Reject and on a finalised Expired proposal, both of which return bonds. It calls `internal_reject_proposal(.., false)` only on Remove (`proposals.rs`). So "no-shows lose their bond" holds only if the no-show's proposal is **removed**. A council that rejects a no-show's proposal refunds them. Muster's `impact-tier` therefore votes Remove, never Reject.

## 3. A spoofed `BountyDone` pays the bond to the attacker

`add_proposal` does not validate `BountyDone` (`// TODO: add more verifications`). Anyone with `bounty_done:AddProposal`, which every volunteer needs, can file `BountyDone{receiver: victim}`. When that proposal is rejected (or expires and is finalised), Sputnik does two things:
- It deletes the victim's claim (`internal_execute_bounty_payout(.., false)`).
- It returns "the bounty bond" to the proposal's proposer, the attacker (`internal_return_bonds`).

Testnet run:
1. `muster-vol-d` RSVPs ([tx](https://testnet.nearblocks.io/txns/FJgmBduYsCE5SoHVfRkVArfYKyfGpB8yxuv6PRVYyVxX)).
2. `muster-vol-e` files `BountyDone{receiver: muster-vol-d}` ([tx](https://testnet.nearblocks.io/txns/Cu5BoRjHevDVaG7rDEfpBi1E4jebgdf3CjQia5zvXGG3)).
3. The council rejects the spoof. **The attacker's balance goes up by 0.51 NEAR**: the victim's 0.5 bond plus the attacker's own 0.01 proposal bond ([tx](https://testnet.nearblocks.io/txns/HymMdSreWw8q2MXQ85vxntZDz5kUJgvfDsbMBrvDDb56)).
4. The victim's real proposal can no longer be approved: `ERR_NO_BOUNTY_CLAIMS` ([tx](https://testnet.nearblocks.io/txns/FvXn1jC2tU3Rrj96yoSLikZskN1UBsFe9W9gsjKdfD29)).

**Defence (confirmed):** settle the volunteer's own proposal first. When `muster-vol-f`'s real proposal is approved before the spoof is acted on ([tx](https://testnet.nearblocks.io/txns/9m62zBB4TPQccoGJrefwiB1Rdv5F7NZp5hPNKkykoY9a)), rejecting the spoof reverts with `ERR_NO_BOUNTY_CLAIMS` ([tx](https://testnet.nearblocks.io/txns/GQPAYrf49TH7thLYGdVyB7vofhNLdvBMoLqy5KGfKGv2)). No bond moves. The spoof stays in progress until it expires, and finalising it reverts the same way.

Muster's rules that follow from this:
- `impact-tier` acts only on proposals where proposer == receiver.
- The council page flags spoofs and hides Reject and Remove for them.
- Done-at-RSVP means the real proposal exists from the moment of the claim, so the keeper can always settle it first.

## 4. Removed bonds stay in `locked_amount`

Remove does not subtract the bond from `locked_amount`. `get_available_amount` therefore keeps excluding forfeited bonds: a forfeit adds to the DAO's balance, but the DAO can't spend it through `Transfer`. Muster's board reports forfeits from its own record, not from `get_available_amount`.

## 5. Factory auto-update can be turned off by the DAO

A new DAO starts with `get_factory_info` = `{"factory_id":"sputnikv2.testnet","auto_update":true}`. A `FactoryInfoUpdate{auto_update: false}` proposal approved by the council changes it to `false` ([proposal](https://testnet.nearblocks.io/txns/BFAQdQMUSDjEaRyy6FtHrbA3k5HYHbQ6ZDRmgXuwZzuT), [final vote](https://testnet.nearblocks.io/txns/5VxBMqPuTT9omTbXyJeXEXPXvfx5bow2snr9xzYpUKqL)). After that, only the DAO's own vote can replace its code.
