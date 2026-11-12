# Muster

**Volunteer campaigns run by your community's own Sputnik DAO.**

A sponsor funds the community's DAO. An organiser posts a campaign, such as a beach cleanup paying 2 USDC per volunteer with 5 slots. Volunteers RSVP by putting down a small bond. At the event they scan a rotating check-in code, and the DAO verifies and pays them: their reward plus their bond back. Volunteers who don't show up lose their bond to the community's treasury. Every verified campaign adds to a volunteer's public record.

Built for NEAR HACKATHON, `social` track. **Status: planning.** The build plan is in [PLAN.md](PLAN.md).

## The problem

- **Organisers.** Free RSVPs cost nothing to ignore, so volunteer events plan food, transport and kits for people who never come.
- **Sponsors.** They pay for announced headcounts that nobody can check.
- **Volunteers.** They have no portable record of the work they did.

## How NEAR is used

Muster does not write its own escrow or voting contract. It uses Sputnik DAO's native bounty flow, which already does what this product needs:

- **Campaign:** a bounty.
- **RSVP:** a claim with a bond.
- **Check-in:** a `BountyDone` proposal.
- **Verification:** a vote by the council, or by Muster's `impact-tier` contract for volunteers with a record.
- **Payout and bond return:** Sputnik's own execution.
- **No-show:** an expired claim, whose bond stays in the DAO.

Money never leaves the community's treasury except by its own rules. Details: [docs/sputnik-reference.md](docs/sputnik-reference.md).

## Try it

Coming with the first build milestone. Steps will follow the "do X, see Y" script in [PLAN.md section 10](PLAN.md#10-demo-script-becomes-the-readmes-do-x-see-y).

## Repository layout

| Path | What |
|---|---|
| `contracts/impact-tier/` | Rust contract that auto-approves check-ins from volunteers with a verified record |
| `scripts/` | Bootstrap a community DAO, create and fund campaigns, simulate volunteers |
| `app/` | Organiser, volunteer, council and public board pages |
| `relayer/` | Pays gas for volunteers' three DAO calls; never pays bonds |
| `config/` | Account ids; `testnet.json` is generated, the example is committed |
| `docs/` | Sputnik reference and design notes |

## Origin and disclosure

Muster is a from-scratch NEAR rebuild of the idea behind **ImpactChain** ([NikhilKottoli/ImpactChain](https://github.com/NikhilKottoli/ImpactChain)), built for EthGlobal 2025 on World Chain by sahil-mengji, vg239, NikhilKottoli, shanjiv177 and suyash101101. No code from ImpactChain is copied. Its campaign, staking and verification design was reviewed and replaced by Sputnik DAO's native bounties; the review is in the [nearpe idea doc](https://github.com/NikhilKottoli/nearpe/blob/ideas-fable/ideas/12-soc/15-impactchain-near.md).

## Licence

MIT. See [LICENSE](LICENSE).
