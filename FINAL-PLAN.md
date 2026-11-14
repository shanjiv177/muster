# Muster: final plan (replaces PLAN.md on approval)

## Context

Submissions close **2026-11-14 23:59 UTC**. One person is building it with Claude. The repo has a plan and a skeleton but no code. The current PLAN.md (rotating QR check-in, `impact-tier` auto-approve, sponsor 1Click page) overlaps heavily with entries that are already live in the social track:

| Rival (social track) | What they already ship | What it means for us |
|---|---|---|
| **Don-Vicks/showup** | Rotating ed25519 door codes, sponsor pay per verified guest, "proven guests" waive the deposit, `/proof` page, 60 s video | Our check-in mechanic and sponsor story are already taken. Drop the rotating QR as the headline |
| **emilhuseyn/patch-fund** | Sputnik bounties with earned trust, auto/co-sign/council tiers, catches proposer≠receiver, live testnet ledger | The "earned-trust bounty board" example prompt is taken. Reputation alone won't stand out |
| **replaycourt/hat-tip** | 1,095 live payouts across 3 tiers, `judge-checks.sh` (15 on-chain facts), 0-key contract, code hash pinned, factory auto-update off | Sets the bar for proof and reproducibility |
| **saltxd/headcount** | 247 tests against the real Sputnik v3.2 wasm (code hash checked), Trezu templates, sybil screening | Sets the bar for testing |
| GatherBond, anonymusk7/near-showup, Pritahi/showup-near | RSVP deposits, check-in, no-show pools, each in its own escrow contract | Crowded "show up" space |
| petty-cash, alltogether, njangi, PasanakuDAO, fair-share, docket, proposal-xray | Other Sputnik-based social money | Most use Sputnik roles plus their own contract |

**Gaps nobody fills, which Muster takes:**

1. **Hours, not headcount.** Volunteering's real currency is verified *hours*. Employer volunteer grants ("Dollars for Doers") pay nonprofits about $8–15 per volunteer hour, but only when the nonprofit confirms the hours by hand, and unconfirmed requests are denied. Students and court-ordered volunteers forge hour sheets: 47 students in Oak Lawn, IL, and felony charges in Clarkstown, NY. Free events lose a median of about 28% of registrants (Pheedloop), and small free events about 37%.
2. **A bond that really forfeits.** Read from `sputnikdao2/src/proposals.rs`: a no-show who files *any* `bounty_done` gets the bond back if the council rejects it (`internal_reject_proposal(.., true)`) or if it expires and is finalised. Only `VoteRemove` keeps it. PLAN.md's "no-shows lose their bond" is therefore false for anyone who files junk evidence. No rival uses `VoteRemove`.
3. **Nothing to do on the day.** Every rival makes the guest scan a code at the door. Muster makes RSVP the whole on-chain act for the volunteer, and the organiser scans.

**New one-liner:** *Volunteer hours anyone can verify, and RSVPs that cost a no-show their bond, run entirely by your community's own Sputnik DAO.*

## Core design (what changes from PLAN.md)

### 1. RSVP is one batched transaction: `bounty_claim` + `bounty_done`
The volunteer signs a single transaction to the DAO with two FunctionCall actions: `bounty_claim(id, deadline)` with the bond attached, then `bounty_done(id, description)` with the proposal bond. This files the `BountyDone` proposal **at RSVP**, under the volunteer's own name (proposer == receiver). After that the volunteer does nothing on chain. The outcome is decided by votes on that proposal:
- Attendance attested and the volunteer trusted → `impact-tier` votes **Approve**: the stipend is paid and the bond returned.
- Attendance attested but the volunteer is new → it waits for one council vote.
- No attendance by `end + grace` → `impact-tier` votes **Remove**: the bond is kept, with no refund path.
- A duplicate claim by the same account on the same bounty → **Remove**.

### 2. Attendance attested by the organiser's scoped key
- The organiser app generates a browser key once and adds it to the organiser's account as a **FunctionCall access key** limited to `impact-tier` methods `["attest"]`. It cannot move money, and scanning needs no wallet pop-ups.
- The volunteer's phone shows a QR code holding the account id and a NEP-413 signed message (`muster:{bounty_id}:{date}`) made at RSVP. The organiser app checks the signature against the account's keys over RPC, then calls `attest(bounty_id, volunteer, In|Out)`. Check-in and check-out give the minutes. (The NEP-413 check is the first thing cut if time runs short; a plain account QR still works.)
- Stated trust assumption: the organiser is a DAO-appointed role. Inflated attendance is visible per organiser on the board, new volunteers still need a council vote, and stipends are capped.

### 3. Campaign terms live in the DAO-approved bounty
`AddBounty.description` ends with a line `MUSTER {"start":…,"end":…,"min_minutes":…,"grace_min":…}`. The council approves these terms when it approves the bounty, so `impact-tier` keeps no campaign registry.

### 4. Defending against Sputnik's unvalidated `BountyDone` (a technical-depth story, with tests)
`add_proposal` does not validate `BountyDone` (`// TODO: add more verifications`). Anyone with `bounty_done:AddProposal`, which every claimant needs, can file `BountyDone{receiver: victim}`. If that proposal is **rejected or expires**, the victim's claim is deleted and the bounty bond goes to the *attacker*, the proposer (`internal_return_bonds`). Muster's defences:
- `impact-tier` acts only when proposer == receiver, and settles the volunteer's own proposal first. Once that removes the claim, a spoofed proposal can never execute: `internal_remove_claim` panics, so reject, remove and finalize all revert.
- Done-at-RSVP means the real proposal always exists from the moment of the claim.
- The council page marks spoofed proposals and hides their vote buttons ("do not reject: rejecting pays the attacker").
- `proposal_bond` = 0.01 NEAR, so each spoofed proposal locks 0.01 NEAR forever.
- Each attack and its defence gets a sandbox test against the real factory wasm, and a write-up in `docs/sputnik-findings.md`. That doc also records that forfeited bonds never leave `locked_amount`, so `get_available_amount` understates the treasury.

### 5. A verifiable hours certificate
`/v/:account` shows total minutes and shifts. Each entry links to its DAO proposal, bounty and attestation transactions. `npm run verify -- <account>` re-derives the record from the chain. This is the artefact an employer, school or court can check.

### Unchanged from PLAN.md
Stock Sputnik DAO from `sputnik-v2.testnet`; sponsors fund the DAO; council majority on `AddBounty`; one council vote for new volunteers; README disclosure of ImpactChain; submission checklist (PLAN.md §12).

### Added back (decision 2026-11-13): NEP-366 relayer, rotating QR, IPFS, near.social, 1Click

Each one is layered on top of the core spine and has a fallback, so none of them can block the must-haves.

**1. NEP-366 relayer (`relayer/`, TypeScript, one serverless app on Vercel or Render)**
- `POST /relay` takes a `SignedDelegate`, wraps it in a transaction from `relayer.muster.testnet`, and sends it. The relayer pays gas only. Any deposit (the 0.5 NEAR bond, the 0.01 NEAR proposal bond) still comes from the volunteer's own balance.
- Allowlist:
  - receivers: the DAO and `impact-tier`;
  - methods: `bounty_claim`, `bounty_done`, `bounty_giveup`, `attest`, `self_attest`, `set_door_key`, `report`.
  - Each request is also capped per action for gas and rate-limited per sender.
- A delegate action can carry several actions to one receiver, so the one-transaction RSVP (claim + done) works as one relayed delegate.
- Who signs:
  - **Muster account** (default): the app makes a key in the browser, and `POST /create-account` creates `name.muster.testnet` with it. Fully gasless after that.
  - **Wallet** users: signed by the wallet if it supports delegate signing, otherwise a normal transaction where they pay gas.
  - **Organiser:** scoped FunctionCall keys can sign delegates with no deposit, so the organiser needs no NEAR for gas either.
- Day-1 probe: does a delegate with a deposit, signed by a full-access key, go through on testnet? Does a FunctionCall-key delegate go through?
- Fallback: the user pays gas directly.

**2. Rotating QR code: a second check-in mode ("self check-in")**
- The organiser's door screen makes an ed25519 door key in the browser and registers it with `impact-tier.set_door_key(bounty_id, pk)`.
- The screen shows a QR code with `sign(bounty_id ‖ minute ‖ In|Out)`, which changes every 30 s.
- The volunteer scans it, and the app calls `impact-tier.self_attest(bounty_id, kind, minute, sig)` through the relayer.
- The contract checks the caller is the claimer, verifies the signature with `env::ed25519_verify`, and accepts a minute within ±2 of now.
- Both modes write the same attendance record, which also stores the mode. `settle` checks that whoever registered the door key is in the `organiser` role.
- Desk scan stays the default; self check-in is for busy entrances.

**3. IPFS**
- Campaign metadata (title, description, location, cover image) is a JSON file pinned through the relayer's `POST /pin`, which holds the pinning API key. The bounty's `MUSTER` line carries `"meta":"ipfs://<cid>"`.
- After the event, the organiser can attach event photos with `impact-tier.report(bounty_id, cid)`. The council page and the certificate show them.
- Fallback: metadata goes inline in the bounty description.

**4. near.social (mainnet only, per near.social/skill.md)**
- Posts are `FunctionCall` writes to account `social`, method `__fastdata_kv`, args `{"post/<ms>":{"text":"…"}}`, with 0 deposit and minimal gas.
- These transactions show `CodeDoesNotExist`. That is expected; check `GET https://api2.near.social/v1/tx/{hash}` for `indexed: true`.
- A mainnet bot account, supplied and funded with about 0.1 NEAR by the user, posts:
  - each new campaign (`#muster`);
  - each verified shift: "@asha… verified 2 h 28 m at #JuhuCleanup", linking the certificate and the testnet proposal.
- The board shows the feed from `api2.near.social/v1/search/posts?q=%23muster`.
- Fallback: posts as a script run by hand.

**5. NEAR Intents 1Click (mainnet only, dry quotes)**
- On `/sponsor`, "Fund from any chain": a 1Click `/v0/quote` with `dry: true` for USDC on Base, Ethereum or Solana into USDC on NEAR, delivered to the DAO.
- On the RSVP page, "Get your 0.51 NEAR bond from another chain", with the same kind of dry quote.
- The testnet demo then funds with a normal `ft_transfer`. The README states that 1Click has no testnet.

**Still cut:** a Trezu screenshot (Trezu is mainnet-only; compatibility is stated) and a mainnet DAO.

**Build order (solo):**
1. The core spine: contract, scripts, board, RSVP, desk scan, certificate, judge.
2. Relayer.
3. Rotating QR self check-in.
4. IPFS metadata.
5. near.social bot.
6. 1Click dry quotes.

If time runs out, cut from the bottom of this list.

## DAO policy (set by `scripts/bootstrap.ts`)

| Setting | Value |
|---|---|
| `bounty_bond` | 0.5 NEAR |
| `proposal_bond` | 0.01 NEAR (anti-spam; returned on approval) |
| `proposal_period` | 14 days (must outlast RSVP → event → grace); demo campaigns use minutes |
| `bounty_forgiveness_period` | 24 h (demo: 2 min) |
| Role `council` (Group) | `*:VoteApprove/VoteReject/VoteRemove/Finalize`, `add_bounty:AddProposal`, `transfer:AddProposal` |
| Role `organiser` (Group) | `add_bounty:AddProposal` |
| Role `tier` (Group: `impact-tier` account) | `bounty_done:VoteApprove`, `bounty_done:VoteRemove` **only** |
| Role `volunteers` (Everyone) | `bounty_done:AddProposal` |
| Vote policy `bounty_done` | RoleWeight, threshold weight 1 (tier alone, or one council member) |
| Vote policy `add_bounty` | council ratio 1/2 |
| Factory auto-update | turned off via a `FactoryInfoUpdate` proposal (matches Hat Tip's check) |

## `impact-tier` contract (Rust, near-sdk 5.x, `contracts/impact-tier/`)

**State:**
- `dao`
- `auto_cap` (max stipend paid without the council)
- `trusted_after` (shifts before auto-approval, e.g. 2)
- `attest: LookupMap<(bounty_id, account), {in_ns, out_ns, in_by, out_by}>`
- `settled: LookupMap<(bounty_id, account), proposal_id>`
- `record: LookupMap<account, {shifts, minutes, entries: Vec<(proposal_id, bounty_id, minutes)>}>`

There is no owner after `new`. All access keys are deleted after deploy, so the contract is locked; a judge check verifies this.

| Method | Caller | Behaviour |
|---|---|---|
| `new(dao, auto_cap, trusted_after)` | deployer | init |
| `attest(bounty_id, volunteer, kind)` | organiser's scoped key | Records the time and the attestor. No deposit, so it works with a FunctionCall key; storage is paid from the contract's balance |
| `settle(proposal_id)` | anyone (a keeper script or the app) | Runs `get_proposal`, `get_bounty` and `get_policy` as a **joint promise**, then one callback decides (below) |
| `credit(proposal_id)` | anyone | Records a council-approved proposal once |
| `set_door_key(bounty_id, public_key)` | organiser's scoped key | Registers the rotating-QR door key; the setter is checked against the `organiser` role at settle |
| `self_attest(bounty_id, kind, minute, signature)` | the volunteer (claimer), usually relayed | Verifies the door signature (`env::ed25519_verify`) and a ±2 min window, then records In or Out |
| `report(bounty_id, cid)` | organiser's scoped key | Attaches an IPFS CID of event photos |
| `record_of(account)`, `attendance_of(bounty_id, account)` | view | |

**`settle` callback decision:**
1. Must be `BountyDone`, `InProgress`, with proposer == receiver. Otherwise do nothing.
2. If `(bounty, receiver)` is already settled with a different proposal → **VoteRemove** (duplicate).
3. Parse the `MUSTER` terms from the bounty. If both In and Out attestations exist, both attestors are in the DAO's `organiser` role (read from the policy), and `out − in ≥ min_minutes`:
   - if the record ≥ `trusted_after` and the amount ≤ `auto_cap` → **VoteApprove**, then credit in the callback;
   - else leave it for the council (the app shows the attestation badge).
4. Else, if `now > end + grace` → **VoteRemove**. Else do nothing yet.

The vote passes the exact `kind` it read, as Sputnik requires.

**Invariants (unit tests and sandbox tests):**
- Votes only on `BountyDone` proposals.
- Never files a proposal.
- Never votes on a proposal where proposer≠receiver.
- At most one Approve per (bounty, account).
- Never removes a proposal that has full attendance.
- Never approves a proposal without attestations from organiser-role accounts.
- Records are credited exactly once.
- Gas budget for `settle`: 150 Tgas, measured.

## Scripts (`scripts/`, TypeScript, near-api-js)

| Script | Does |
|---|---|
| `fetch-sputnik.ts` | Downloads the wasm the testnet factory deploys and pins its code hash, for sandbox tests |
| `bootstrap.ts` | Factory `create` with the policy above; deploys and locks `impact-tier`; turns off auto-update; writes `config/testnet.json` |
| `fund.ts`, `campaign.ts` | Test-token funding; `AddBounty` with `MUSTER` terms, plus the council vote |
| `simulate.ts` | A: trusted, attended → auto-paid. B: new, attended → council vote. C: no-show → Removed, bond kept. D: gives up in time → refunded. E: double-claims → second proposal Removed. F: spoofs `BountyDone` for A → never executes |
| `keeper.ts` | Loops `settle` over open `BountyDone` proposals (the demo runs it; anyone can) |
| `judge.ts` (`npm run judge`) | About 12 read-only chain checks: DAO code hash = factory's; the exact policy; tier role permissions; `impact-tier` has 0 access keys and its code hash = the repo build; auto-update off; the demo campaign outcomes (paid, removed and refunded bonds with tx links); `verify` reproduces A's hours |
| `verify.ts` | Rebuilds any account's hours from proposals plus attestations |

## App (`app/`, React + Vite + TS, wallet selector, GitHub Pages, testnet, no backend)

Pages, in priority order:
1. `/` board: treasury, campaigns, RSVPs, paid / removed / refunded, cost per verified hour.
2. `/c/:id` campaign + RSVP: the batched transaction, then a QR code.
3. `/organiser/scan/:id`: adds the scoped key once, then camera scanning and `attest` In/Out.
4. `/council`: proposals with attendance badges and spoofed proposals flagged.
5. `/v/:account` certificate.
6. `/proof`: the real testnet run, step by step, with tx links, for judges without a wallet.
7. `/organiser/new`.

## Schedule

**Today, 11-12 (evening): testnet probe before any code.**
- Create the accounts.
- Using `near` CLI against a factory DAO, confirm:
  - (a) batched claim+done in one tx;
  - (b) Reject refunds the bond and Remove keeps it;
  - (c) a spoofed `BountyDone` + reject sends the bond to the attacker;
  - (d) a FunctionCall key can call a non-payable method;
  - (e) the factory `create` args and the deployed `version`.
- Record the results with tx hashes in `docs/sputnik-findings.md`.
- If (a) fails, fall back to two transactions at RSVP; the design is otherwise unchanged.

**11-13: the spine from scripts.**
- `impact-tier` plus unit tests, and sandbox tests against the pinned factory wasm.
- `bootstrap`, `campaign`, `simulate`, `keeper`, `judge` on testnet.
- Done when `npm run demo` (sandbox) and `npm run judge` (testnet) both pass from a fresh clone.

**11-14 (until about 18:00 UTC): browser and shipping.**
- Pages 1–6, deployed to GitHub Pages.
- README written for the AI judge: problem with sources, track-requirement table with live links, "do X, see Y", honest limits, a rival-difference table, the ImpactChain disclosure.
- 90 s video.
- The user makes the repo public and posts on X. The submission payload is confirmed by the user before the POST.

**Cut order:** NEP-413 check → `/organiser/new` (use the script) → council page (use `near` CLI) → `/proof` polish. These must survive any cut: done-at-RSVP, attest, settle Approve/Remove, board, certificate, judge checks, sandbox tests.

## Files to change on approval
- `PLAN.md`: rewrite with this plan.
- `README.md`: new one-liner, problem and differentiators.
- `docs/sputnik-reference.md`: add the reject/remove/expiry bond paths and the `add_proposal` gap.
- New `docs/sputnik-findings.md`, `contracts/impact-tier/README.md`, `relayer/README.md` (mark as cut).

## Verification
- `cargo test` in `contracts/impact-tier`: the unit invariants.
- Sandbox integration tests on the pinned Sputnik wasm: scenarios A–F, each asserting balances, bond location and proposal status.
- `npm run demo` (sandbox story) and `npm run judge` (testnet facts) both exit 0 from a fresh clone.
- Manual browser run: RSVP from a second wallet, scan from the organiser phone, the keeper settles, the payout shows up on the board and the certificate.
