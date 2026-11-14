> **Superseded.** The design that was built is [FINAL-PLAN.md](FINAL-PLAN.md), and the README describes what runs today. This file is kept for history.

# Muster: build plan

Muster runs volunteer campaigns on a community's own Sputnik DAO. A sponsor funds the DAO, an organiser posts a campaign, volunteers RSVP with a small bond, and checked-in volunteers are verified and paid by the DAO itself. No-shows lose their bond to the community's treasury.

This file is the working plan for the NEAR HACKATHON `social` entry. Submissions close **2026-11-14 23:59 UTC**. Origin and the analysis behind every decision here: [`nearpe` idea doc](https://github.com/NikhilKottoli/nearpe/blob/ideas-fable/ideas/12-soc/15-impactchain-near.md), which reviews the team's earlier ImpactChain project. Sputnik facts used below, with source lines, are in [`docs/sputnik-reference.md`](docs/sputnik-reference.md).

Status: **plan and skeleton only.** No contract, app or script code yet.

---

## 1. Summary and track fit

**Problem.** Volunteer events lose a large share of RSVPs to no-shows, so organisers over-plan food, transport and kits. Sponsors and CSR budgets pay for announced headcounts nobody can check. Volunteers have no portable record of the work they did. ImpactChain tried to solve this with its own escrow and voting contracts, which had serious bugs (14 listed in the idea doc). Muster uses the community's own Sputnik DAO instead.

**How Muster maps onto Sputnik's native bounty flow:**

| Muster | Sputnik v2 |
|---|---|
| Campaign with a per-volunteer reward | `AddBounty` proposal: token, amount, `times` (slots), `max_deadline` |
| RSVP with a stake | `bounty_claim` with the DAO's `bounty_bond` attached |
| Check-in and evidence | `bounty_done` with the check-in code and photo hash in the description; this files a `BountyDone` proposal |
| Verification | A council vote on `BountyDone`, or the `impact-tier` contract's vote for trusted volunteers |
| Reward and stake returned | Approval pays the bounty and returns the bond |
| No-show | The claim expires; the bond stays in the DAO |
| Early cancellation | `bounty_giveup` inside the forgiveness period returns the bond |

**Social track checklist** ([HACKATHON.md](https://nearhackathon.com/HACKATHON.md): "Build shared budgets, programmable rewards, collective ownership and reputation-based access on top of Sputnik DAO and Trezu. Don't rebuild the multisig"):

| Requirement | Muster |
|---|---|
| Shared budgets | One DAO treasury funded by sponsors, paying every campaign |
| Programmable rewards | Native bounties with bond return and retention |
| Collective ownership | Forfeited bonds and unspent funds stay with the community |
| Reputation-based access | `impact-tier` auto-approves volunteers with a verified record |
| Sputnik and Trezu, no new multisig | Stock factory DAO; the same DAO opens in Trezu |
| Named accounts | `asha.muster.testnet`, `<community>.sputnik-v2.testnet` |
| Example prompt: custody in the existing DAO | All custody and payouts are the DAO's |
| Example prompt: points traceable to finished work | Each point is an approved `BountyDone` proposal id |
| Example prompt: tiers | Trusted: tier contract; new: one council vote; large campaigns: council majority on `AddBounty` |
| Example prompt: public board | Campaigns, claims, payouts, forfeits, records |

**Rivals and how Muster differs:**

| Rival | Overlap | Difference |
|---|---|---|
| ShowUp (`Don-Vicks/showup`) | RSVP deposits, rotating-QR check-in, sponsor pay per verified guest | ShowUp holds funds in its own contract. Muster's custody and decisions are the community's DAO, and it builds a record across campaigns |
| Patch Fund (`emilhuseyn/patch-fund`) | Sputnik bounties with earned trust | Open-source fixes, not physical volunteering |
| Hat Tip (`replaycourt/hat-tip`) | Tiered approvals in a Sputnik DAO | Peer thanks, no stake at risk |
| CareFund (`sasindu-smart/carefund`) | Community money for good causes | Grants to cases, not volunteers |

The pitch leads with "the community's DAO runs the campaign", not with the mechanism.

---

## 2. Architecture

```
 Sponsor ──USDC──▶  Community DAO  (stock Sputnik v2 from sputnik-v2.testnet)
                    roles: council · organiser · tier(impact-tier) · volunteers(Everyone)
                          ▲  AddBounty / bounty_claim / bounty_done / votes / payouts
                          │
   Organiser app ─────────┤        impact-tier contract ── votes on BountyDone only
   Volunteer app ── relayer (gas only) ──┘        ▲
   Public board ── reads DAO view methods         │ try_approve(proposal_id), callable by anyone
                                                  │
   IPFS: campaign metadata, photos      near.social: campaign feed      1Click: sponsor dry quotes
```

**Components:**

| Component | Path | Responsibility |
|---|---|---|
| Community DAO | none; created by `scripts/bootstrap.ts` | Custody, campaigns, claims, votes, payouts |
| `impact-tier` | `contracts/impact-tier/` | Holds the `tier` role; verifies check-in codes and records; votes to approve `BountyDone` |
| App | `app/` | Organiser, volunteer and board surfaces; reads DAO views directly; no database |
| Relayer | `relayer/` | Pays gas for volunteers' `bounty_claim`, `bounty_done`, `bounty_giveup` only |
| Scripts | `scripts/` | Bootstrap, campaign creation, simulation, fast-forward, forgery test |
| Config | `config/testnet.json` (generated; example committed) | The single source of account ids |

**DAO policy** (set by `bootstrap.ts`):

| Setting | Value | Why |
|---|---|---|
| `bounty_bond` | 0.5 NEAR | The RSVP stake; one value for the whole DAO |
| `proposal_bond` | 0 | `bounty_done` files a proposal, so a bond would tax every check-in |
| `bounty_forgiveness_period` | 24 h | Free cancellation up to a day after RSVP; the demo uses minutes |
| `proposal_period` | 7 days | Default; council has a week to verify |
| Role `council` | Group of verifiers | `*:VoteApprove`, `*:VoteReject`, `*:VoteRemove`, `*:Finalize`, `add_bounty:AddProposal` |
| Role `organiser` | Group | `add_bounty:AddProposal`, `transfer:AddProposal` |
| Role `tier` | Group of one: the `impact-tier` account | `bounty_done:VoteApprove` only |
| Role `volunteers` | Everyone | `bounty_done:AddProposal`, which `bounty_done` needs because it calls `add_proposal` |
| Vote policy `bounty_done` | `RoleWeight`, threshold weight 1 | One council vote, or the tier role's one vote, approves; any role reaching its own threshold approves |
| Vote policy `add_bounty` | `RoleWeight`, threshold ratio 1/2 | Council majority |

**One campaign, end to end:**

```
Sponsor     → DAO        : ft_transfer_call(USDC 100)                    (or plain ft_transfer)
Organiser   → DAO        : add_proposal(AddBounty{usdc, 2, times 5, max_deadline})
Council     → DAO        : act_proposal(id, VoteApprove, kind)            → bounty created
Volunteer   → relayer    : signed delegate: DAO.bounty_claim(b, deadline) + 0.5 NEAR (own funds)
Organiser   screen       : rotating code = sign(bounty_id ‖ minute)
Volunteer   → relayer    : signed delegate: DAO.bounty_done(b, desc{code, cid})  → BountyDone proposal p
Anyone      → impact-tier: try_approve(p)
impact-tier → DAO        : get_proposal(p) → checks → act_proposal(p, VoteApprove, kind)
DAO                      : pays 2 USDC to volunteer, returns 0.5 NEAR bond
No-show                  : deadline passes → anyone calls bounty_done on the expired claim → slot freed, bond kept
```

---

## 3. Domain model and glossary

| Term | Meaning | On chain as |
|---|---|---|
| Community | A group that runs campaigns | A Sputnik DAO account |
| Sponsor | Anyone who funds the community | A token transfer to the DAO |
| Organiser | Member who posts campaigns and runs check-in | Account in the `organiser` role, plus an ed25519 check-in key registered in `impact-tier` |
| Council | Verifiers | Accounts in the `council` role |
| Campaign | One event with a reward per volunteer and a number of slots | A Sputnik bounty |
| RSVP | A volunteer's commitment | A bounty claim with the bond |
| Check-in code | Short-lived proof of presence at the event | Organiser signature over `(bounty_id, minute)` |
| Evidence | What the volunteer submits | The `bounty_done` description: JSON with the code, time and optional photo CID |
| Verification | Deciding that the volunteer showed up | An approve vote on the `BountyDone` proposal |
| Record | A volunteer's count of verified campaigns | Kept by `impact-tier`; every point maps to a proposal id |
| Tier | Whether a volunteer is trusted for auto-approval | `record >= min_record` |
| Forfeit | A no-show's bond kept by the DAO | Expired claim; DAO `locked_amount` |

---

## 4. Contract spec: `impact-tier`

Rust, `near-sdk` 5.x. One instance per community DAO.

**State:**

```
dao: AccountId
owner: AccountId                     // can call configure; intended to become the DAO itself
organiser_keys: Vec<ed25519 PublicKey>
min_record: u32                      // e.g. 1 for the demo, 3 in practice
code_window_minutes: u8              // accepted skew, e.g. 2
record: LookupMap<AccountId, u32>
processed: LookupSet<u64>            // proposal ids already handled
```

**Methods:**

| Method | Caller | Behaviour |
|---|---|---|
| `new(dao, owner, organiser_keys, min_record, code_window_minutes)` | deployer | Initialise |
| `configure(organiser_keys, min_record, code_window_minutes)` | `owner` | Update settings |
| `try_approve(proposal_id) -> Promise` | anyone | See the flow below |
| `record_of(account) -> u32` | view | The account's count |
| `credit(proposal_id)` | anyone | After a `BountyDone` proposal is `Approved` by anyone, including the council, view it and increment `record[receiver]` once. This is how new volunteers build a record |

**`try_approve` flow:**

1. Require `proposal_id ∉ processed`.
2. Cross-contract view `dao.get_proposal(proposal_id)`. In the callback:
   - Require `kind == BountyDone{bounty_id, receiver_id}` and `status == InProgress`; otherwise return without voting.
   - Parse the description's JSON line `{"code": "...", "cid": "..."}`. Decode the code to `(bounty_id, minute, signature)`. Require `bounty_id` to match, `|now_minute − minute| <= code_window_minutes`, and `env::ed25519_verify(signature, bounty_id ‖ minute, key)` for some organiser key.
   - Require `record[receiver_id] >= min_record`.
   - Call `dao.act_proposal(proposal_id, "VoteApprove", <the exact kind read>, memo)`. Sputnik checks the passed kind matches the stored one.
   - Mark `processed`; increment the record when the payout is confirmed through `credit`.
3. Any failed check returns quietly. The proposal stays for the council.

**Invariants (each gets a test):**

- Votes only on `BountyDone` proposals; never on any other kind.
- Never files proposals of any kind.
- At most one vote per proposal.
- A forged code, a code for another bounty, or a stale code never produces a vote.
- A volunteer below `min_record` never gets a vote.

**Failure modes and gas.** Two cross-contract hops (view, then vote) plus callbacks. Budget 100 Tgas for `try_approve` and measure on day 1. If the DAO later removes the `tier` role, `act_proposal` fails and the council handles everything; Muster still works without the tier contract.

---

## 5. Check-in code format

- **Payload:** `bounty_id` (u64, big-endian) ‖ `minute` (u32, `floor(unix_time / 60)`).
- **Signature:** ed25519 by the organiser's check-in key, held in the organiser's browser.
- **Code:** `base64url(payload ‖ signature)`, 12 + 64 bytes, shown as a QR code that refreshes every 30 seconds.
- **Accepted:** within ±`code_window_minutes` of the block time.
- **Evidence description in `bounty_done`:** a human sentence, then one line `MUSTER {"code":"…","cid":"ipfs://…","t":1731400000}`. `impact-tier` parses only the line starting with `MUSTER `.
- **Limitation, stated in the README:** a code proves the volunteer saw the organiser's screen within the window. A forwarded screenshot defeats it within that window. The photo CID helps the council; it is not proof.

---

## 6. Scripts

All TypeScript with `near-api-js`, reading accounts from `.env` and writing ids to `config/testnet.json`.

| Script | Inputs | Transactions | Expected output |
|---|---|---|---|
| `bootstrap.ts` | Organiser account, council accounts | Factory `create` of the DAO with the policy in section 2; deploy `impact-tier`; register organiser key | DAO id, tier id and printed policy, written to `config/testnet.json` |
| `campaign.ts` | Title, reward, slots, deadline minutes | `add_proposal(AddBounty)`, council `act_proposal` | Bounty id |
| `fund.ts` | Amount | Test token `ft_transfer` to the DAO (with `storage_deposit` if needed) | DAO token balance |
| `simulate.ts` | Bounty id | Volunteer A (has a record) claims and checks in; B (new) claims and checks in; C claims and does nothing; D claims and gives up | Log of claims, proposals, votes, payouts and bonds |
| `fast-forward.ts` | Bounty id | `bounty_done` on expired claims | Freed slots and bonds retained |
| `forge.ts` | Bounty id | `bounty_done` with a code signed by a wrong key, then `try_approve` | No vote; proposal still `InProgress` |

For the demo, campaigns use deadlines of a few minutes, so expiry can be shown live.

---

## 7. App pages and data reads

React + Vite + TypeScript, `near-api-js` and NEAR wallet selector. No database: every screen reads DAO or `impact-tier` view methods; metadata comes from IPFS.

| Page | Shows | Reads | Writes |
|---|---|---|---|
| `/` Community | Treasury balance, active campaigns, sponsors | `get_bounties`, `ft_balance_of(dao)` | none |
| `/campaign/:id` | Details, slots left, RSVP button | `get_bounty`, `get_bounty_number_of_claims`, IPFS | `bounty_claim` (relayed gas, own bond) |
| `/organiser/new` | Create campaign form | `get_policy` | `add_proposal(AddBounty)` |
| `/organiser/checkin/:id` | Rotating QR code | none | none (signs locally) |
| `/volunteer/scan/:id` | Camera or paste, photo upload | none | IPFS upload, `bounty_done` |
| `/council` | Pending `BountyDone` proposals with evidence | `get_proposals` | `act_proposal` |
| `/board` | Payouts, forfeits, records leaderboard | `get_proposals`, `get_bounty_claims`, `record_of` | none |
| `/sponsor` | Fund the DAO; dry-run 1Click quote from another chain | 1Click `/v0/quote` with `dry: true` | Testnet `ft_transfer` |

**Sign-in:** wallet selector (MyNearWallet, Meteor) first. NEAR Auth email login is added only if it is confirmed to work on testnet (section 11). Volunteers get named sub-accounts `<name>.muster.testnet` created by the bootstrap account.

---

## 8. Bond policy

The volunteer funds their own bond. If an organiser or the relayer paid it, Sputnik would still return it to the volunteer on approval, because the bond goes to whoever filed the proposal. A sponsored bond would then be free money, and a no-show would lose nothing. The relayer therefore pays gas only, never attached deposits.

The README states two limits plainly:

- The bond is in NEAR and is one value for the whole DAO (`policy.bounty_bond`), so all campaigns in a community share it.
- On mainnet, a new volunteer needs about 0.5 NEAR; the sponsor page can show a 1Click dry quote for getting it from another chain.

---

## 9. Milestones and acceptance tests

**Day 1, 2026-11-13: the spine works from scripts.**

- [ ] Install `cargo-near` and `near` CLI; create testnet accounts (organiser, two council, four volunteers, relayer) from the faucet; keys in `~/.near-credentials`, never in the repo.
- [ ] `bootstrap.ts` creates the DAO with the section 2 policy; `get_policy` output matches.
- [ ] `fund.ts`, `campaign.ts` and `simulate.ts` without the tier contract: one council-approved payout, one expiry, one give-up, all visible in the explorer.
- [ ] Answer section 11's questions 1–3.
- [ ] `impact-tier` unit tests for every invariant; sandbox test against the real Sputnik wasm proving one auto-approval and one refusal.

Done when: `npm run demo:native` prints the payout, forfeit and give-up results from a clean DAO.

**Day 2, 2026-11-14 (morning to late afternoon UTC): the browser flow.**

- [ ] App pages from section 7 for organiser, volunteer, council and board.
- [ ] Relayer for the three volunteer methods, gas only.
- [ ] `impact-tier` deployed and holding the `tier` role; `try_approve` triggered by the app after `bounty_done`.

Done when: a person who has never seen the app runs one campaign in a browser from creation to payout.

**Day 2.5, 2026-11-14 (before 23:59 UTC): shipping.**

- [ ] near.social campaign posts.
- [ ] Trezu screenshot of the DAO.
- [ ] `/sponsor` dry quote.
- [ ] README "do X, see Y" reproduced from a fresh clone.
- [ ] Demo video recorded.
- [ ] Repo made public by the human; X post published by the human; submission sent only after the human confirms the payload (section 12).

Done when: every item in section 12 is ticked.

**Cut order if time runs short:** sponsor dry quote, then near.social, then the relayer (volunteers pay their own gas), then the tier contract (council approves everything). The native Sputnik flow and the board must survive any cut.

---

## 10. Demo script (becomes the README's "do X, see Y")

1. Run `npm run bootstrap`. See a new DAO on testnet from `sputnik-v2.testnet` and its policy printed: bond 0.5 NEAR, proposal bond 0, tier role present.
2. Run `npm run fund -- 100`. See 100 test USDC in the treasury, in the app and in Trezu.
3. Create "Juhu beach cleanup, 2 USDC per volunteer, 5 slots". See the `AddBounty` proposal approved.
4. Three volunteers RSVP. See three claims and 1.5 NEAR locked.
5. Volunteer A, who has a record, scans the rotating code. See `bounty_done`, `impact-tier` approve it, and 2 USDC plus 0.5 NEAR arrive. Volunteer B, who is new, checks in. See the proposal wait, then a council member approve it.
6. Volunteer C does not come. Run `npm run fast-forward`. See the claim expire and the bond stay in the treasury.
7. Run `npm run forge`. See a code signed by the wrong key refused, and the proposal left for the council.
8. Open `/board`. See campaigns, payouts, forfeits and each volunteer's record.

---

## 11. Risks and open questions

Each is answered on day 1 with a specific test before anything is built on it.

| # | Question | Test | If the answer is bad |
|---|---|---|---|
| 1 | Can one account claim the same bounty twice? | Claim twice from one account in `simulate.ts` | Block in the app; note in the README |
| 2 | Does the testnet factory deploy the same Sputnik version as `main`, including `act_proposal(id, action, proposal, memo)`? | Call `version` on the created DAO; check the `act_proposal` argument shape | Adjust the call to the deployed version |
| 3 | Gas for `try_approve` (view, then vote, then callbacks) | Measure in sandbox and on testnet | Raise the gas budget, or split into `prepare`/`approve` |
| 4 | Does the Everyone role with `bounty_done:AddProposal` let any account file `bounty_done`? | First `bounty_done` from a volunteer not in any group | Add volunteers to a `volunteers` group on RSVP, via the organiser |
| 5 | Does Trezu display a factory DAO's bounties and custom roles? | Open the DAO in Trezu | Show bounties only in Muster; Trezu for the treasury |
| 6 | Does NEAR Auth email login work on testnet without approval? | Try the documented testnet flow | Keep wallet selector only |
| 7 | Factory `create` arguments and required deposit | Read the factory source before calling | Follow the source |

Known limits to state in the README: the check-in code proves presence near a screen, not work; the bond is NEAR-only and DAO-wide; the council can still spend the treasury by vote, which is the community's normal governance.

---

## 12. Submission checklist

From [HACKATHON.md](https://nearhackathon.com/HACKATHON.md); re-read it before submitting, because rules may change.

- [ ] Repo public before 2026-11-14 23:59 UTC. The human makes it public.
- [ ] `LICENSE` present (MIT).
- [ ] README written for an AI judge first: problem, product, NEAR's role, "do X, see Y".
- [ ] README disclosure: Muster is a from-scratch NEAR rebuild of ImpactChain (EthGlobal 2025); no code was copied; credits to the original contributors. Any reused library is listed (Q-002, Q-004, Q-005).
- [ ] If any team member submits two projects, both READMEs name each other (Q-015, at most two per person).
- [ ] Demo video, and an X post by the human: says it was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, video attached.
- [ ] Payload fields supplied by the human, never guessed: project name, lead name, email, team size, tracks (`social`, possibly `realworld`), mainnet NEAR payout account, repo URL, demo post URL, description of 20–2000 characters, and the consent notice read verbatim.
- [ ] The full JSON payload is printed and confirmed by the human before `POST https://nearhackathon.com/api/applications`. One submission per project; mistakes go through `/request-changes`.
- [ ] No keys or `.env` files committed.
