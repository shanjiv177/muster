import { Link, useParams } from "react-router-dom";
import { DEP, addrLink, fmtTime, rebuild, recordOf } from "../chain";
import { Acct, Err, Loading, useAsync } from "../ui";

export default function Certificate() {
  const account = useParams().account!;
  const { data: d, error, loading } = useAsync(async () => {
    const [shifts, rec] = await Promise.all([rebuild(account), recordOf(account)]);
    const minutes = shifts.reduce((s, x) => s + x.minutes, 0);
    return { shifts, rec, minutes, match: rec.shifts === shifts.length && rec.minutes === minutes };
  }, [account]);
  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading what="this volunteer's record" />;
  const h = Math.floor(d.minutes / 60), m = d.minutes % 60;
  return (
    <>
      <div className="card cert">
        <div className="small muted">Verified volunteer record on NEAR {DEP.network}</div>
        <h1 style={{ marginTop: 6, fontSize: "clamp(1.6rem, 3.6vw, 2.4rem)", wordBreak: "break-all" }}>{account}</h1>
        <div className="row" style={{ gap: 30, margin: "10px 0" }}>
          <div><div className="big">{h}h {m}m</div><div className="small muted">verified time on site</div></div>
          <div><div className="big">{d.shifts.length}</div><div className="small muted">shifts</div></div>
        </div>
        <p className="small">
          Every shift below is a <b>BountyDone</b> proposal the community's DAO <Acct id={DEP.dao} /> approved, with check-in and check-out signed by accounts in its <code>organiser</code> role.
          This page rebuilds the total from that chain data in your browser and compares it with the record kept by the rules contract <Acct id={DEP.impactTier} />:
          {" "}{d.match ? <span className="pill ok">match</span> : <span className="pill warn">differs: some approved shifts aren't credited yet</span>}
        </p>
      </div>

      <h2>Shifts</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Shift</th><th>Checked in and out</th><th>Minutes</th><th>Attested by</th><th>DAO proposal</th></tr></thead>
          <tbody>
            {d.shifts.map((s) => (
              <tr key={s.proposal.id}>
                <td><Link to={`/c/${s.campaign!.id}`}>{s.campaign!.title}</Link><div className="small muted">{s.campaign!.place}</div></td>
                <td className="small">{fmtTime(Number(BigInt(s.att.in_ns!) / 1_000_000_000n))} to {new Date(Number(BigInt(s.att.out_ns!) / 1_000_000n)).toLocaleTimeString()}</td>
                <td>{s.minutes}</td>
                <td className="small"><Acct id={s.att.in_by!} /></td>
                <td className="small">#{s.proposal.id}, approved by {Object.keys(s.proposal.votes).map((v) => (v === DEP.impactTier ? "rules contract" : v)).join(", ")}</td>
              </tr>
            ))}
            {!d.shifts.length && <tr><td colSpan={5} className="muted">No verified shifts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <h2>Check it yourself</h2>
      <ul className="small">
        <li>From a clone of the repo: <code>npm run verify -- {account}</code> rebuilds this from the chain and exits 0 if it matches.</li>
        <li>Raw: call <code>record_of {"{"}"account":"{account}"{"}"}</code> on <a href={addrLink(DEP.impactTier)}>{DEP.impactTier}</a>, and <code>get_proposal</code> on <a href={addrLink(DEP.dao)}>{DEP.dao}</a> for each proposal id.</li>
      </ul>
    </>
  );
}
