# relayer

A NEP-366 meta-transaction relayer. It pays gas for organiser check-ins and other zero-deposit Muster calls.

**It never relays an action with a deposit.** On testnet the relayer, not the sender, paid the 0.2 NEAR inside a delegate action (`docs/sputnik-findings.md` §6). If the relayer forwarded an RSVP, it would post the bond, and a no-show would lose nothing.

| Receiver | Methods relayed |
|---|---|
| impact-tier | `attest`, `settle`, `credit` |
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

To host it, set `RELAYER_ACCOUNT`, `RELAYER_PRIVATE_KEY`, `PORT`, and `ALLOW_ORIGIN` (your app's origin). Then build the app with `VITE_RELAYER_URL` set to the relayer's URL.
