import { useState } from "react";
import { DEP, organisersOf, policy, toYocto, txLink } from "../chain";
import { outcomeError, outcomeHash, useWallet, walletCall } from "../wallet";
import { useAsync } from "../ui";

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function NewCampaign() {
  const w = useWallet();
  const pol = useAsync(policy);
  const soon = new Date(Date.now() + 86_400_000);
  const [f, setF] = useState({ title: "", place: "", start: local(soon), hours: 3, min: 90, grace: 30, slots: 20, stipend: 0.1 });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value });

  const start = Math.floor(new Date(f.start).getTime() / 1000);
  const terms = { start, end: start + Math.round(f.hours * 3600), min_minutes: f.min, grace_min: f.grace };
  const description = `${f.title}\n${f.place} · ${new Date(start * 1000).toISOString().replace("T", " ").slice(0, 16)} UTC\nMUSTER ${JSON.stringify(terms)}`;
  const canPropose = !!w.accountId && !!pol.data && (organisersOf(pol.data).includes(w.accountId) || (pol.data.roles.find((r: any) => r.name === "council")?.kind?.Group ?? []).includes(w.accountId));

  async function submit() {
    setMsg(null);
    try {
      const bounty = { description, token: "", amount: toYocto(f.stipend).toString(), times: f.slots, max_deadline: (14n * 86_400n * 1_000_000_000n).toString() };
      const out = await walletCall(w, DEP.dao, [{ method: "add_proposal", args: { proposal: { description: `Campaign: ${f.title}`, kind: { AddBounty: { bounty } } } }, tgas: 100, deposit: BigInt(pol.data.proposal_bond) }]);
      const err = outcomeError(out);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: "Proposed. It goes live once a council majority approves it on the Council page.", hash: outcomeHash(out) });
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
  }

  return (
    <>
      <h1>New campaign</h1>
      <p className="lead">An organiser proposes a shift as a DAO bounty. The council approves the terms; after that, nobody can change them without another vote.</p>
      <div className="grid wide">
        <div className="card">
          <label>Title</label><input value={f.title} onChange={set("title")} placeholder="Juhu Beach cleanup" />
          <label>Place</label><input value={f.place} onChange={set("place")} placeholder="Juhu Beach, Mumbai" />
          <label>Starts</label><input type="datetime-local" value={f.start} onChange={set("start")} />
          <div className="row">
            <div style={{ flex: 1 }}><label>Length (hours)</label><input type="number" min={0.25} step={0.25} value={f.hours} onChange={set("hours")} /></div>
            <div style={{ flex: 1 }}><label>Min minutes on site</label><input type="number" min={1} value={f.min} onChange={set("min")} /></div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}><label>Grace after end (min)</label><input type="number" min={0} value={f.grace} onChange={set("grace")} /></div>
            <div style={{ flex: 1 }}><label>Places</label><input type="number" min={1} value={f.slots} onChange={set("slots")} /></div>
            <div style={{ flex: 1 }}><label>Stipend (NEAR)</label><input type="number" min={0} step={0.01} value={f.stipend} onChange={set("stipend")} /></div>
          </div>
          <div style={{ marginTop: 14 }}>
            {!w.accountId ? <button className="btn" onClick={() => w.modal?.show()}>Sign in as organiser</button>
              : <button className="btn" disabled={!canPropose || !f.title} onClick={submit}>Propose campaign</button>}
            {w.accountId && pol.data && !canPropose && <div className="notice small">Only accounts in the DAO's organiser or council role can propose campaigns.</div>}
          </div>
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">tx</a>}</div>}
        </div>
        <div className="card">
          <h3>What goes on chain</h3>
          <p className="small muted">The bounty description. Its last line holds the terms the rules contract reads at settlement.</p>
          <pre className="mono small" style={{ whiteSpace: "pre-wrap", background: "#f3efe2", padding: 12, borderRadius: 8 }}>{description}</pre>
        </div>
      </div>
    </>
  );
}
