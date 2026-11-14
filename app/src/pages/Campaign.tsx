import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { DEP, attendanceOf, bountyDone, campaigns, fmtTime, minutesOf, nearStr, outcomes, policy, proposals, txLink } from "../chain";
import { outcomeError, outcomeHash, useWallet, walletCall } from "../wallet";
import { Err, Loading, StatusPill, useAsync } from "../ui";
import DoorScan from "../DoorScan";
import { fetchMeta, gatewayUrl, metaUri } from "../ipfs";

const NS = 1_000_000_000n;

export function qrPayload(bountyId: number, account: string) {
  return `muster:${bountyId}:${account}`;
}

function MyQr({ bountyId, account }: { bountyId: number; account: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(qrPayload(bountyId, account), { width: 260, margin: 1 }).then(setSrc); }, [bountyId, account]);
  return (
    <div>
      <h3>Show this at the entrance</h3>
      <p className="muted">The organiser scans it when you arrive and leave.</p>
      {src && <div className="qr"><img src={src} width={240} height={240} alt={`Check-in code for ${account}`} /></div>}
    </div>
  );
}

async function load(id: number, me: string | null) {
  const [camps, props, pol, outs] = await Promise.all([campaigns(), proposals(), policy(), outcomes()]);
  const c = camps.find((x) => x.id === id);
  if (!c) throw new Error(`No bounty #${id} in ${DEP.dao}`);
  const uri = metaUri(c.description);
  const meta = uri ? await fetchMeta(uri) : null;
  const rsvps = props.filter((p) => bountyDone(p)?.bounty_id === id);
  const rows = await Promise.all(rsvps.map(async (p) => ({ p, att: await attendanceOf(id, bountyDone(p)!.receiver_id) })));
  const removed = outs.filter((o) => o.bounty_id === id && o.outcome === "removed");
  const mine = me ? rows.find((r) => r.p.proposer === me && bountyDone(r.p)!.receiver_id === me) : undefined;
  const myRemoved = me ? removed.find((o) => o.account === me) : undefined;
  return { meta, uri, c, rows, removed, bond: BigInt(pol.bounty_bond), proposalBond: BigInt(pol.proposal_bond), mine, myRemoved };
}

export default function CampaignPage() {
  const id = Number(useParams().id);
  const w = useWallet();
  const { data: d, error, loading, reload } = useAsync(() => load(id, w.accountId), [id, w.accountId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading />;
  const { c } = d;
  const t = c.terms;
  const ended = t ? Date.now() / 1000 > t.end : false;

  async function rsvp() {
    setBusy(true); setMsg(null);
    try {
      const out = await walletCall(w, DEP.dao, [
        { method: "bounty_claim", args: { id, deadline: (14n * 86_400n * NS).toString() }, tgas: 50, deposit: d!.bond },
        { method: "bounty_done", args: { id, description: `RSVP from ${w.accountId} via Muster` }, tgas: 100, deposit: d!.proposalBond },
      ]);
      const err = outcomeError(out);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: "You're in. Your bond is held by the DAO.", hash: outcomeHash(out) });
      reload();
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
    setBusy(false);
  }

  async function giveUp() {
    setBusy(true); setMsg(null);
    try {
      const out = await walletCall(w, DEP.dao, [{ method: "bounty_giveup", args: { id }, tgas: 50 }]);
      const err = outcomeError(out);
      setMsg(err ? { ok: false, text: err } : { ok: true, text: "Place released. Within 24 h of your RSVP the bond comes back.", hash: outcomeHash(out) });
      reload();
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
    setBusy(false);
  }

  const when = t ? new Date(t.start * 1000) : null;
  const hours = t ? (t.end - t.start) / 3600 : 0;
  const action = !w.accountId ? (
    <button className="btn primary lg block" onClick={() => w.modal?.show()}>Sign in to RSVP</button>
  ) : d.mine ? (
    <div>
      <div className="row"><StatusPill status={d.mine.p.status} /><span className="small muted">Proposal #{d.mine.p.id}</span></div>
      {d.mine.p.status === "InProgress" && !d.mine.att.in_ns && <button className="btn ghost sm" style={{ marginTop: 14 }} disabled={busy} onClick={giveUp}>Give up my place</button>}
    </div>
  ) : d.myRemoved ? (
    <div className="notice bad">Removed: {d.myRemoved.reason}. The bond stayed with the DAO.</div>
  ) : (
    <button className="btn primary lg block" disabled={busy || ended} onClick={rsvp}>{ended ? "Shift has ended" : "RSVP"}</button>
  );

  return (
    <>
      <Link className="back" to="/">All shifts</Link>
      <div className="event">
        <div>
          {when && <div className="event-when">{when.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>}
          <h1>{c.title}</h1>
          <p className="lead">{c.place}{when && <>, {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}</p>
          {d.meta?.cover && <img className="cover" src={gatewayUrl(d.meta.cover)} alt={`Cover photo for ${c.title}`} />}
          {d.meta?.about && <p className="about">{d.meta.about}</p>}

          <div className="facts">
            <div><b>{hours % 1 ? hours.toFixed(1) : hours}h</b><span>shift</span></div>
            {t && <div><b>{t.min_minutes}m</b><span>minimum on site</span></div>}
            <div><b>{nearStr(c.amount)}</b><span>NEAR stipend</span></div>
            <div><b>{c.times - c.claims}</b><span>of {c.times} places left</span></div>
          </div>
        </div>

        <aside className="panel">
          <div className="panel-amount"><b>{nearStr(d.bond + d.proposalBond, 2)}</b> NEAR bond</div>
          <p className="small muted">Returned when you attend. Kept if you don't.</p>
          {action}
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">View transaction</a>}</div>}
        </aside>
      </div>

      {w.accountId && d.mine && d.mine.p.status === "InProgress" && (
        <section className="block">
          <h2>On the day</h2>
          <div className="checkin">
            <MyQr bountyId={id} account={w.accountId} />
            <div>
              <h3>Or scan the door code</h3>
              <p className="muted">If there's a screen at the entrance, scan it on arrival and again when you leave.</p>
              <DoorScan bountyId={id} onDone={reload} />
            </div>
          </div>
        </section>
      )}

      <section className="block">
        <h2>Who's coming</h2>
        <div className="people">
          {d.rows.map(({ p, att }) => {
            const bd = bountyDone(p)!;
            const spoof = bd.receiver_id !== p.proposer;
            const m = minutesOf(att);
            return (
              <div className="person" key={p.id}>
                {spoof ? <span className="small muted">{p.proposer} filed a claim naming {bd.receiver_id}</span> : <Link to={`/v/${bd.receiver_id}`}>{bd.receiver_id}</Link>}
                <span className="row">{m !== null && <span className="small muted">{m} min</span>}{spoof ? <span className="pill bad">Spoofed</span> : <StatusPill status={p.status} />}</span>
              </div>
            );
          })}
          {d.removed.map((o) => (
            <div className="person" key={`r${o.proposal_id}`}><span>{o.account}</span><span className="pill bad">No-show</span></div>
          ))}
          {!d.rows.length && !d.removed.length && <p className="muted">No one yet. Be the first.</p>}
        </div>
      </section>

      <details className="more-info">
        <summary>On-chain details</summary>
        <p className="small muted">This shift is bounty #{c.id} in <a href={`https://testnet.nearblocks.io/address/${DEP.dao}`}>{DEP.dao}</a>. RSVP is one transaction: <code>bounty_claim</code> with the {nearStr(d.bond, 2)} NEAR bond, then <code>bounty_done</code> with a {nearStr(d.proposalBond, 2)} NEAR proposal bond. Your first verified shift needs one council vote; after that the rules contract approves automatically.</p>
        {t && <p className="small muted">No-show after {fmtTime(t.end + t.grace_min * 60)}. Terms approved by the council: <code>{c.description.split("\n").pop()}</code></p>}
        {d.uri && <p className="small muted">Details on IPFS: <a href={gatewayUrl(d.uri)} target="_blank" rel="noreferrer">{d.uri}</a></p>}
      </details>
    </>
  );
}
