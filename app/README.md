# app

React + Vite + TypeScript, with NEAR Wallet Selector (MyNearWallet, Meteor). There is no backend: every page reads the DAO and impact-tier over RPC. Account ids come from `../deployments/testnet.json`.

| Route | Page |
|---|---|
| `#/` | Board: treasury, RSVPs, shifts paid, verified hours, no-shows, stipend per verified hour, the rules contract's vote log |
| `#/c/:id` | Campaign: terms, a one-transaction RSVP (claim + done), give up, QR check-in code, RSVP list |
| `#/organiser/scan/:id` | Organiser: add a FunctionCall check-in key once, then camera or typed check-in/out. Uses the relayer when `VITE_RELAYER_URL` is set |
| `#/council` | Open shift proposals with attendance badges, spoof warnings, no Reject button; credit approved shifts |
| `#/v/:account` | Certificate: verified minutes rebuilt in the browser from chain data and compared with the contract's record |
| `#/proof` | Live policy checks and the scripted testnet run with transaction links |
| `#/organiser/new` | Propose a campaign (an `AddBounty` with `MUSTER` terms) |

```bash
npm ci && npm run dev        # http://localhost:5173
npm run build                # dist/, deployed by .github/workflows/pages.yml
```
