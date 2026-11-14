# relayer

A NEP-366 meta-transaction relayer. It pays gas for organiser check-ins and other zero-deposit Muster calls.

**It never relays an action with a deposit.** On testnet the relayer, not the sender, paid the 0.2 NEAR inside a delegate action (`docs/sputnik-findings.md` §6). If the relayer forwarded an RSVP, it would post the bond, and a no-show would lose nothing.

| Receiver | Methods relayed |
|---|---|
| impact-tier | `attest`, `set_door_key`, `self_attest`, `settle`, `credit` |
| community DAO | `bounty_giveup` |

Other rules:
- Only function calls are relayed.
- Gas is capped at 300 Tgas per action.
- At most 4 actions per delegate.
- 120 requests per sender per hour.

```bash
npm run relayer                      # :8787, signs as muster-relay.testnet from ~/.near-credentials
npm run test:relayer                 # allowlist + rate-limit tests
curl localhost:8787/health
```

`POST /relay {"signedDelegate": "<base64 borsh SignedDelegate>"}` returns `{ok, hash, link, error}`.

`POST /pin` pins campaign details (JSON) or a cover photo (JPEG, PNG or WebP, up to 2 MB) to IPFS through Pinata, and returns `ipfs://<cid>`. Only DAO organisers can pin:
- the request is signed with the organiser's impact-tier check-in key, over `muster-pin:<account>:<sha256 of the file>:<timestamp>`;
- the relayer checks on chain that this key belongs to the account and is scoped to impact-tier;
- the relayer checks that the account is in the DAO's `organiser` role.

The Pinata JWT (`PINATA_JWT`) stays in the server's env file.

To host it, set `RELAYER_ACCOUNT`, `RELAYER_PRIVATE_KEY`, `PORT`, and `ALLOW_ORIGIN` (your app's origin). Then build the app with `VITE_RELAYER_URL` set to the relayer's URL.

## Hosted instance

The relayer runs at `https://rupee-rail.indiasouthcentral.cloudapp.azure.com/muster-relay/` (try `/health`). It is a separate service on a shared VM:
- systemd unit `muster-relayer`, running as user `muster`;
- its own Node in `/opt/muster/node`;
- secrets in `/etc/muster/relayer.env`;
- a Caddy route on that host (`deploy/`).

To update it, run `RELAYER_HOST=user@host relayer/deploy/deploy.sh`.
