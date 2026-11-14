import { Link } from "react-router-dom";
import { DEP, addrLink, campaigns, outcomes } from "../chain";
import { Acct, Err, Loading, StatusPill, useAsync } from "../ui";

export default function Activity() {
  const { data, error, loading } = useAsync(async () => {
    const [outs, camps] = await Promise.all([outcomes(), campaigns()]);
    return { outs: outs.slice().reverse(), camps };
  });
  if (error) return <Err e={error} />;
  if (loading || !data) return <Loading />;
  return (
    <>
      <h1>Activity</h1>
      <p className="lead">
        Every vote the rules contract <a href={addrLink(DEP.impactTier)}>{DEP.impactTier}</a> cast, and every council approval it credited. Removed claims are deleted from the DAO, so this log is where you can still see them.
      </p>
      <table>
        <thead><tr><th>Volunteer</th><th>Shift</th><th>Outcome</th><th>Minutes</th><th>Why</th></tr></thead>
        <tbody>
          {data.outs.map((o, i) => (
            <tr key={i}>
              <td><Link to={`/v/${o.account}`}>{o.account}</Link></td>
              <td><Link to={`/c/${o.bounty_id}`}>{data.camps.find((c) => c.id === o.bounty_id)?.title ?? `Shift ${o.bounty_id}`}</Link><div className="small muted">proposal #{o.proposal_id}</div></td>
              <td><StatusPill status={o.outcome} /></td>
              <td>{o.minutes || "–"}</td>
              <td className="small muted">{o.reason}</td>
            </tr>
          ))}
          {!data.outs.length && <tr><td colSpan={5} className="muted">No decisions yet. They appear after the first shift is settled.</td></tr>}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 24 }}>Council: {DEP.council.map((c, i) => <span key={c}>{i ? ", " : ""}<Acct id={c} /></span>)}. Organisers: {DEP.organisers.map((c) => <Acct key={c} id={c} />)}.</p>
    </>
  );
}
