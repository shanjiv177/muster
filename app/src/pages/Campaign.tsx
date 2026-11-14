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
    <div className="card" style={{ textAlign: "center" }}>
      <h3>Your check-in code</h3>
      <p className="small muted">Show this to the organiser when you arrive and when you leave. You don't sign anything on the day.</p>
      {src && <div className="qr"><img src={src} width={260} height={260} alt={`check-in code for ${account}`} /></div>}
      <div className="mono small" style={{ marginTop: 8 }}>{qrPayload(bountyId, account)}</div>
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

  return (
    <>
      <Link className="back" to="/">All shifts</Link>
      <h1>{c.title}</h1>
      <p className="lead">{c.place}{t && <>, {fmtTime(t.start)} to {fmtTime(t.end)}</>}</p>
      {d.meta?.cover && <img className="cover" src={gatewayUrl(d.meta.cover)} alt={`Cover photo for ${c.title}`} />}
      {d.meta?.about && <p style={{ whiteSpace: "pre-line", marginBottom: 28 }}>{d.meta.about}</p>}
      {d.uri && !d.meta && <p className="small muted">The shift details on IPFS ({d.uri}) haven't loaded yet.</p>}
      <div className="grid wide">
        <div className="card">
          <h3>Terms approved by the DAO council</h3>
          <table><tbody>
            <tr><td>Bond to RSVP</td><td><b>{nearStr(d.bond, 2)} NEAR</b> + {nearStr(d.proposalBond, 2)} NEAR proposal bond</td></tr>
            <tr><td>Stipend</td><td>{nearStr(c.amount, 2)} NEAR</td></tr>
            {t && <tr><td>Counts as attended</td><td>checked in and out by an organiser, at least {t.min_minutes} min apart</td></tr>}
            {t && <tr><td>No-show after</td><td>{fmtTime(t.end + t.grace_min * 60)} (end + {t.grace_min} min grace)</td></tr>}
            <tr><td>Places</td><td>{c.claims} of {c.times} held</td></tr>
          </tbody></table>
          {d.uri && <p className="small muted">Details and photo: <a href={gatewayUrl(d.uri)} target="_blank" rel="noreferrer">{d.uri}</a></p>}
          <p className="small muted">These terms are the last line of bounty #{c.id}'s description: <code>{c.description.split("\n").pop()}</code></p>
        </div>

        <div className="card">
          <h3>RSVP</h3>
          <ol className="steps small">
            <li>One transaction locks your bond and files your payout claim in your own name.</li>
            <li>On the day, the organiser scans your code when you arrive and when you leave.</li>
            <li>If you attended, the stipend is paid and your bond comes back. Your first shift needs one council vote; after that it is automatic. If you didn't come, the DAO keeps the bond.</li>
          </ol>
          {!w.accountId ? (
            <button className="btn primary" onClick={() => w.modal?.show()}>Sign in to RSVP</button>
          ) : d.mine ? (
            <div className="row"><StatusPill status={d.mine.p.status} /> <span className="small">You're on proposal #{d.mine.p.id}</span>
              {d.mine.p.status === "InProgress" && !d.mine.att.in_ns && <button className="btn sm ghost" disabled={busy} onClick={giveUp}>Give up my place</button>}
            </div>
          ) : d.myRemoved ? (
            <div className="notice bad">Your RSVP #{d.myRemoved.proposal_id} was removed ({d.myRemoved.reason}). The bond stayed with the DAO.</div>
          ) : (
            <button className="btn primary" disabled={busy || ended} onClick={rsvp}>{ended ? "Shift has ended" : `RSVP and lock ${nearStr(d.bond + d.proposalBond, 2)} NEAR`}</button>
          )}
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">tx</a>}</div>}
        </div>
      </div>

      {w.accountId && d.mine && d.mine.p.status === "InProgress" && (
        <div className="grid wide" style={{ marginTop: 20 }}>
          <MyQr bountyId={id} account={w.accountId} />
          <div className="card">
            <h3>Or check yourself in</h3>
            <p className="small muted">If the organiser has a door screen up, scan its code when you arrive and again when you leave. Your wallet asks you to confirm each one.</p>
            <DoorScan bountyId={id} onDone={reload} />
          </div>
        </div>
      )}

      <h2>RSVPs</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Proposal</th><th>Volunteer</th><th>Status</th><th>Checked in</th><th>Minutes</th></tr></thead>
          <tbody>
            {d.rows.map(({ p, att }) => {
              const bd = bountyDone(p)!;
              const spoof = bd.receiver_id !== p.proposer;
              return (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>{spoof ? <><span className="pill bad">spoof</span> <span className="mono small">{p.proposer} names {bd.receiver_id}</span></> : <Link className="mono" to={`/v/${bd.receiver_id}`}>{bd.receiver_id}</Link>}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td>{att.in_ns ? new Date(Number(BigInt(att.in_ns) / 1_000_000n)).toLocaleTimeString() : "—"}</td>
                  <td>{minutesOf(att) ?? "—"}</td>
                </tr>
              );
            })}
            {d.removed.map((o) => (
              <tr key={`r${o.proposal_id}`}><td>#{o.proposal_id}</td><td className="mono">{o.account}</td><td><StatusPill status="removed" /></td><td>—</td><td className="small muted">{o.reason}, bond kept</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
