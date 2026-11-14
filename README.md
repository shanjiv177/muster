# Muster

**Volunteer hours anyone can verify, and RSVPs that cost a no-show their bond, run entirely by your community's own Sputnik DAO.**

Built at NEAR HACKATHON for the `social` track. Everything below runs on **NEAR testnet** today:
- Community DAO: [`muster-juhu.sputnikv2.testnet`](https://testnet.nearblocks.io/address/muster-juhu.sputnikv2.testnet). It is stock Sputnik v2 from the `sputnikv2.testnet` factory, with factory auto-update turned off.
- Rules contract: [`v2.muster-tier.testnet`](https://testnet.nearblocks.io/address/v2.muster-tier.testnet), Rust, with zero access keys. It replaced v1 through a council vote that moved the DAO's `tier` role, which is the only way it can be upgraded.
- App: **https://shanjiv177.github.io/muster/**. React, reading the chain directly with no backend.
- NEP-366 relayer: **https://rupee-rail.indiasouthcentral.cloudapp.azure.com/muster-relay/health**. It pays gas for check-ins, and never for bonds.

| For a judge, in 2 minutes | |
|---|---|
| See it without a wallet | [App → Proof](https://shanjiv177.github.io/muster/#/proof): live policy checks, plus every transaction of the scripted run |
| Re-check the chain from a clone | `npm ci && npm run judge` (read-only, no keys) |
| Rebuild one volunteer's hours from chain data | `npm run verify -- rmwg629bw.muster-vol-a.testnet` |
| Contract tests | `cd contracts/impact-tier && cargo test` (42 tests) |
| What Sputnik really does with bonds, tested on testnet | [docs/sputnik-findings.md](docs/sputnik-findings.md) |
| Every transaction of the end-to-end run | [docs/testnet-run.md](docs/testnet-run.md) |

## The problem

**Volunteer hours are the currency of volunteering, and today nobody can check them.**
- **Employers pay for hours.** "Dollars for Doers" programmes give nonprofits about **$8–15 per volunteer hour**, but only after the nonprofit confirms the hours by hand, and unconfirmed requests are denied ([Double the Donation](https://doublethedonation.com/volunteer-grant-requests/)).
- **Hour sheets get forged.** 47 students in Oak Lawn, IL faced consequences over faked service hours ([ABC7 Chicago](https://abc7chicago.com/oak-lawn-community-service-graduation-high-school/69507)). In Clarkstown, NY, faked community-service letters led to felony charges ([Rockland Times](https://rocklandtimes.com/2016/02/25/five-charged-with-faking-community-service-letters-of-completion)).
- **Free RSVPs are free to ignore.** Free events lose a median of **28%** of registrants, and small free events about **37%** ([Pheedloop](https://pheedloop.com/blog/event-data-lab-report-5)). Organisers buy food, transport and kits for people who never come.

## What Muster does

1. **An organiser proposes a shift** as a DAO bounty. Its terms (start, end, minimum minutes, grace) sit in the bounty description, and the council approves them by vote.
2. **A volunteer RSVPs in one transaction.** It has two actions:
   - `bounty_claim`, with a 0.5 NEAR bond;
   - `bounty_done`, with a 0.01 NEAR proposal bond.

   This files the volunteer's payout proposal **now**, under their own name. On the day they only show a QR code; they sign nothing.
3. **The organiser scans the volunteer in and out.** The phone holds a browser key added to the organiser's account as a **FunctionCall access key**. It can only call `attest` on the rules contract, so it cannot move money. With the relayer, each scan is a NEP-366 meta-transaction: no wallet pop-up, and no gas for the organiser.
4. **Anyone calls `settle`.** The rules contract reads the proposal, the bounty, the DAO policy and the volunteer's live claims in **one joint promise**, then acts:
   - **Attended, with a verified record, and the stipend under the cap:** it votes **Approve**. The DAO pays the stipend and returns the bond.
   - **Attended, first shift:** it waits for **one council vote**, then `credit` records the shift.
   - **No check-in by end + grace:** it votes **Remove**. The proposal is deleted and the **bond stays with the DAO**.
5. **The volunteer gets a certificate**: `/v/<account>` lists their verified minutes. The page rebuilds the total from DAO proposals and organiser attestations, and compares it with the contract's record.

### Why this is harder than it looks: Sputnik facts we tested on testnet

| Finding | Consequence for Muster | Proof |
|---|---|---|
| A **Reject** vote, or an expired proposal that is finalised, **refunds** a bounty bond. Only **Remove** keeps it | "No-shows lose their bond" is false unless the no-show's proposal is *removed*. impact-tier votes Remove, and the council page has no Reject button | [§2](docs/sputnik-findings.md#2-only-voteremove-forfeits-the-bond) |
| `add_proposal` doesn't validate `BountyDone`. A spoofed proposal naming someone else, once rejected, **pays the victim's bond to the attacker** | impact-tier never votes on proposer ≠ receiver. The real proposal exists from the moment of RSVP and is settled first, after which the spoof can never execute. The council UI flags spoofs | [§3](docs/sputnik-findings.md#3-a-spoofed-bountydone-pays-the-bond-to-the-attacker) |
| In NEP-366, **the relayer pays any deposit** inside a delegate action | A relayed RSVP would let no-shows off free. The relayer refuses every action with a deposit | [§6](docs/sputnik-findings.md#6-nep-366-the-relayer-pays-deposits-inside-a-delegate-action) |
| A FunctionCall key **can** sign a delegate action | Organiser check-ins are gasless and need no pop-ups | [§7](docs/sputnik-findings.md#7-a-functioncall-access-key-can-sign-a-delegate-action) |
| A second claim + done RSVP for the same shift reverts as one unit | One proposal per volunteer per shift, with no extra code | [§8](docs/sputnik-findings.md#8-a-double-rsvp-reverts-by-itself) |
| Forfeited bonds stay in `locked_amount` | The board counts forfeits from the contract's log, not from `get_available_amount` | [§4](docs/sputnik-findings.md#4-removed-bonds-stay-in-locked_amount) |

## Do X, see Y

| Do | See |
|---|---|
| Open the app's **Proof** page | 7 live PASS checks: stock code hash, auto-update off, a 0-key rules contract, exact role permissions. Below them, scenarios A–G with transaction links |
| Open the [home page](https://shanjiv177.github.io/muster/) | A real verified shift drawn as a timecard and stamped by the DAO, live totals, and open shifts. **Activity** shows every vote the rules contract cast |
| Open the certificate for `rmwg629bw.muster-vol-a.testnet` | 2 verified shifts. The first was approved by the council, the second automatically by the rules contract. The chain rebuild shows **match** |
| Sign in with a testnet wallet, open a campaign, press **RSVP** | One wallet transaction with `bounty_claim` and `bounty_done`. A QR check-in code appears |
| Sign in as an organiser, open **Organiser check-in**, press **Add check-in key**, then scan or type a volunteer | A FunctionCall key appears on your account (impact-tier, `attest` only). Each scan is an `attest` transaction with no wallet pop-up |
| Open **Council** | Open shift proposals with attendance badges, spoofs flagged with a warning, and no Reject button |
| `npm run simulate` (needs the testnet keys created by bootstrap) | Scenarios A–G run end to end in about 8 minutes. Output goes to `docs/testnet-run.md` |

### Run it locally

```bash
npm ci                                    # scripts + relayer
cd contracts/impact-tier && cargo test && cargo near build non-reproducible-wasm && cd ../..
npm run judge                             # read-only chain checks, no keys needed
npm run verify -- rmwg629bw.muster-vol-a.testnet

cd app && npm ci && npm run dev           # http://localhost:5173
# optional gasless check-ins: in another shell `npm run relayer`, then
# VITE_RELAYER_URL=http://localhost:8787 npm run dev
```

To create your own community from scratch, you need testnet accounts in `~/.near-credentials` (see `scripts/bootstrap.ts`). Then run `npm run bootstrap`, `npm run simulate`, `npm run lock-tier`, and `npm run judge`.

## How NEAR is used

| Piece | NEAR feature |
|---|---|
| Custody, campaigns, payouts, forfeits | **Sputnik DAO v2** from the stock factory. Bounties, `bounty_claim` with a bond, `BountyDone` proposals, role-based votes. Muster has no escrow contract of its own |
| Rules | `impact-tier` (Rust, near-sdk 5.30) holds the DAO's `tier` role, which may only `VoteApprove` and `VoteRemove` on `bounty_done`. Cross-contract joint promise of four views, then `act_proposal` with the exact proposal kind. No owner, **0 access keys** |
| Upgrade safety | Factory `auto_update` turned off by a `FactoryInfoUpdate` proposal, so only the community can change its DAO's code |
| One-transaction RSVP | A batched transaction with two FunctionCall actions to the DAO |
| Organiser check-in | **FunctionCall access key** limited to `attest`, plus a **NEP-366** relayer |
| Accounts | Named accounts and sub-accounts. The rules contract is versioned (`v1` → `v2.muster-tier.testnet`), and the DAO voted the `tier` role over to v2 ([tx](https://testnet.nearblocks.io/txns/5u9oysVmmSEcEi32fKH6CbpXU9JAx62Ya9k9iEKGivCJ)) |
| Self check-in | `env::ed25519_verify` on a rotating door QR: the organiser's screen signs `muster-door:<contract>:<shift>:<30 s slot>:<In\|Out>`, and codes older than 2 minutes are refused |
| Campaign details | IPFS, pinned through the relayer to Pinata. Only organisers can pin, and uploads are signed with their check-in key. The bounty records `META ipfs://<cid>`. Example: [shift 12](https://shanjiv177.github.io/muster/#/c/12), whose details are at [`bafkreidjxd…`](https://gateway.pinata.cloud/ipfs/bafkreidjxd7a7wd6gy5jqq35enqy75nhboahfaycr54x7yvrr4eh4l5up4) |

### Track fit (social)

| Track asks for | Muster |
|---|---|
| Shared budgets | One DAO treasury funded by sponsors pays every shift |
| Programmable rewards | Stipends plus bond return, decided by the rules contract or one council vote |
| Collective ownership | Forfeited bonds and unspent funds stay in the community's DAO |
| Reputation-based access | Volunteers with a verified record are auto-approved up to a cap; new volunteers need one council vote |
| Build on Sputnik and Trezu; don't rebuild the multisig | Stock factory DAO, with the same code hash as the factory default (checked by `judge`). Trezu works with factory DAOs, but it is mainnet-only, so this testnet demo isn't shown there |
| Points traceable to finished work | Every verified minute is an approved `BountyDone` proposal plus two organiser attestations |

### How it differs from other social-track entries

| Entry | What it does | Muster's difference |
|---|---|---|
| ShowUp, GatherBond, other "show up" entries | RSVP deposits and door codes, in their own escrow contracts | Custody is the community's Sputnik DAO. It measures **hours**, not just headcount, and the forfeit is enforced with Sputnik's VoteRemove, tested against the reject-refund path |
| Patch Fund | Sputnik bounties with earned trust, for code fixes | Physical shifts with timed attestations, and a portable hours certificate |
| Hat Tip | A tier contract that approves its own Transfer proposals; strong judge checks | Muster's tier contract also **removes** no-shows. It defends against the unvalidated `BountyDone` attack, tested on testnet |

## Honest limits

- **Testnet only.** Stipends are paid in NEAR on testnet. A mainnet community would pay in a stablecoin, which Sputnik bounties support.
- **Trust in organisers.** The check-in is as honest as the DAO-appointed organiser. To contain that:
  - every attestation is on chain and attributed to the organiser who made it;
  - a volunteer's first shift still needs a council vote;
  - auto-approval is capped at 0.2 NEAR.
- **The volunteer needs NEAR for the bond.** By design: in NEP-366 the relayer would pay the bond, so RSVPs are wallet transactions. Gas is ~0.003 NEAR.
- **Someone has to call `settle`.** Anyone can: the app, the keeper script (`npm run keeper`), or the volunteer.
- **Partial attendance goes to the council.** That covers a check-in without a check-out, and a shift shorter than the minimum. The contract never auto-forfeits a volunteer who checked in.
- **The door QR can be shared within its 2-minute window.** A volunteer at the venue could send a fresh code to a friend who isn't there. Rotation limits this to a short window, and the organiser-scan mode stays available where that matters.
- **Not built yet:** near.social posts and a NEAR Intents (1Click) sponsor page. Both are mainnet-only.
- **The demo shifts are short.** The scripted run uses 1–3 minute shifts so it finishes in minutes.

## Repository

| Path | What |
|---|---|
| `contracts/impact-tier/` | Rust rules contract: `terms.rs` (the `MUSTER {...}` terms), `decide.rs` (the pure decision, with invariant tests), `lib.rs` (attest, settle, credit, views) |
| `scripts/` | `probe`, `bootstrap`, `simulate`, `keeper`, `verify`, `judge`, `lock-tier`, `balances`; `probes/` holds the NEP-366 experiments |
| `relayer/` | NEP-366 relayer: allowlist, deposit refusal, rate limit, tests |
| `app/` | React + Vite: board, campaign/RSVP/QR, organiser scan, council, certificate, proof, new campaign |
| `deployments/testnet.json` | Live account ids and the proposal ids of the scripted run (read by `judge` and the app) |
| `docs/` | Sputnik reference, findings tested on testnet, and the testnet run log |
| `FINAL-PLAN.md` | The design this build follows |

## Origin and disclosure

Muster is a from-scratch NEAR rebuild of the idea behind **ImpactChain** ([NikhilKottoli/ImpactChain](https://github.com/NikhilKottoli/ImpactChain)). ImpactChain was built for EthGlobal 2025 on World Chain by sahil-mengji, vg239, NikhilKottoli, shanjiv177 and suyash101101. No code from ImpactChain is copied: its campaign, staking and verification contracts are replaced here by Sputnik DAO's native bounties.

Open-source libraries used:
- near-sdk;
- near-api-js and @near-js/*;
- NEAR Wallet Selector;
- React, React Router and Vite;
- qrcode and qr-scanner;
- borsh.

Built with Claude Code.

## Licence

MIT. See [LICENSE](LICENSE).
