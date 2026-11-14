import { Link } from "react-router-dom";
import { DEP, balanceOf, bountyDone, campaigns, fmtTime, nearStr, outcomes, policy, proposals } from "../chain";
import { Acct, Err, Loading, Stat, StatusPill, useAsync } from "../ui";

async function load() {
  const [camps, props, outs, pol, treasury] = await Promise.all([campaigns(), proposals(), outcomes(), policy(), balanceOf(DEP.dao)]);
  const own = props.filter((p) => { const bd = bountyDone(p); return bd && bd.receiver_id === p.proposer; });
  const removed = outs.filter((o) => o.outcome === "removed");
  const approved = own.filter((p) => p.status === "Approved");
  const credited = outs.filter((o) => o.outcome === "approved" || o.outcome === "credited");
  const minutes = credited.reduce((s, o) => s + o.minutes, 0);
  const paid = approved.reduce((s, p) => s + (camps.find((c) => c.id === bountyDone(p)!.bounty_id)?.amount ?? 0n), 0n);
  const bond = BigInt(pol.bounty_bond);
  return { camps: camps.filter((c) => c.terms), own, removed, approved, credited, minutes, paid, bond, treasury, outs };
}

export default function Board() {
  const { data: d, error, loading } = useAsync(load);
  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading />;
  const hours = d.minutes / 60;
  return (
    <>
      <h1>Volunteer hours anyone can verify.</h1>
      <p className="lead">
        Juhu Beach volunteers run on their own <a href={`https://testnet.nearblocks.io/address/${DEP.dao}`}>Sputnik DAO</a>. An RSVP locks a {nearStr(d.bond, 1)} NEAR bond in the DAO. An organiser checks you in and out.
        Turn up and the DAO pays the stipend and returns your bond. If you don't, the rules contract votes <b>Remove</b> and the DAO keeps the bond.
      </p>
      <div className="grid" style={{ marginTop: 18 }}>
        <Stat n={`${nearStr(d.treasury, 1)} Ⓝ`} l="DAO treasury" />
        <Stat n={d.own.length + d.removed.length} l="RSVPs (bonded)" />
        <Stat n={d.approved.length} l="Shifts paid" />
        <Stat n={hours.toFixed(1)} l="Verified hours" />
        <Stat n={d.removed.length} l={`No-shows (${nearStr(d.bond * BigInt(d.removed.length), 1)} Ⓝ kept)`} />
        <Stat n={hours > 0 ? `${nearStr(d.paid / BigInt(Math.max(1, Math.round(hours * 100))) * 100n, 2)} Ⓝ` : "—"} l="Stipend per verified hour" />
      </div>

      <h2>Campaigns</h2>
      <div className="grid wide">
        {d.camps.slice().reverse().map((c) => {
          const open = c.terms && Date.now() / 1000 < c.terms.end;
          return (
            <div className="card" key={c.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="pill">bounty #{c.id}</span>
                {open ? <span className="pill ok">open</span> : <span className="pill">ended</span>}
              </div>
              <h3 style={{ marginTop: 10 }}>{c.title}</h3>
              <div className="muted small">{c.place}</div>
              <div className="small" style={{ margin: "8px 0" }}>
                {c.terms && <>{fmtTime(c.terms.start)} → {fmtTime(c.terms.end)}<br />at least {c.terms.min_minutes} min on site · </>}
                stipend {nearStr(c.amount)} Ⓝ · {c.claims}/{c.times} places held
              </div>
              <div className="row">
                <Link className="btn sm" to={`/c/${c.id}`}>View &amp; RSVP</Link>
                <Link className="btn sm ghost" to={`/organiser/scan/${c.id}`}>Organiser check-in</Link>
              </div>
            </div>
          );
        })}
      </div>

      <h2>What the rules contract did</h2>
      <p className="muted small">Every row is a vote the <span className="mono">tier</span> role cast on chain, or a council approval it then credited. Removed proposals are deleted from the DAO, so this log is how you see them.</p>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Proposal</th><th>Volunteer</th><th>Outcome</th><th>Minutes</th><th>Reason</th></tr></thead>
          <tbody>
            {d.outs.slice().reverse().slice(0, 30).map((o, i) => (
              <tr key={i}>
                <td>#{o.proposal_id} · bounty {o.bounty_id}</td>
                <td><Link className="mono" to={`/v/${o.account}`}>{o.account}</Link></td>
                <td><StatusPill status={o.outcome} /></td>
                <td>{o.minutes || "—"}</td>
                <td className="small muted">{o.reason}</td>
              </tr>
            ))}
            {!d.outs.length && <tr><td colSpan={5} className="muted">No outcomes yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted">Council: {DEP.council.map((c) => <span key={c}><Acct id={c} /> </span>)} · Organisers: {DEP.organisers.map((c) => <Acct key={c} id={c} />)}</p>
    </>
  );
}
