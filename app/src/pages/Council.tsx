import { useState } from "react";
import { Link } from "react-router-dom";
import { DEP, attendanceOf, bountyDone, campaigns, minutesOf, nearStr, organisersOf, policy, proposals, txLink, view, type Proposal } from "../chain";
import { outcomeError, outcomeHash, useWallet, walletCall } from "../wallet";
import { Acct, Err, Loading, StatusPill, useAsync } from "../ui";

async function load() {
  const [props, camps, pol] = await Promise.all([proposals(), campaigns(), policy()]);
  const council: string[] = pol.roles.find((r: any) => r.name === "council")?.kind?.Group ?? [];
  const orgs = organisersOf(pol);
  const done = await Promise.all(
    props.filter((p) => bountyDone(p) && (p.status === "InProgress" || p.status === "Approved")).map(async (p) => {
      const bd = bountyDone(p)!;
      const att = await attendanceOf(bd.bounty_id, bd.receiver_id);
      const credited = p.status === "Approved" ? await view<boolean>(DEP.impactTier, "is_credited", { proposal_id: p.id }) : false;
      const claims = await view<any[]>(DEP.dao, "get_bounty_claims", { account_id: bd.receiver_id });
      return { p, bd, att, credited, hasClaim: claims.some((c) => c.bounty_id === bd.bounty_id), camp: camps.find((c) => c.id === bd.bounty_id), attested: !!att.in_by && !!att.out_by && orgs.includes(att.in_by) && orgs.includes(att.out_by) };
    }),
  );
  const other = props.filter((p) => !bountyDone(p) && p.status === "InProgress");
  return { done: done.reverse(), other, council };
}

export default function Council() {
  const w = useWallet();
  const { data: d, error, loading, reload } = useAsync(load);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading />;
  const isCouncil = !!w.accountId && d.council.includes(w.accountId);

  async function run(label: string, receiver: string, method: string, args: object, tgas: number) {
    setMsg(null);
    try {
      const out = await walletCall(w, receiver, [{ method, args, tgas }]);
      const err = outcomeError(out);
      setMsg(err ? { ok: false, text: `${label}: ${err}` } : { ok: true, text: `${label}: done`, hash: outcomeHash(out) });
      reload();
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
  }
  const vote = (p: Proposal, action: string) => run(`${action} #${p.id}`, DEP.dao, "act_proposal", { id: p.id, action, proposal: p.kind }, 200);

  const open = d.done.filter((x) => x.p.status === "InProgress" && x.hasClaim);
  const approvedUncredited = d.done.filter((x) => x.p.status === "Approved" && !x.credited && x.attested);

  return (
    <>
      <h1>Council</h1>
      <p className="lead">First shifts and anything unusual. The rules contract handles the rest.</p>
      {!w.accountId && <button className="btn" onClick={() => w.modal?.show()}>Sign in as council</button>}
      {w.accountId && !isCouncil && <div className="notice"><span className="mono">{w.accountId}</span> isn't on the council. You can still ask the rules contract to settle a proposal: anyone can.</div>}
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">tx</a>}</div>}

      <h2>Open shift proposals</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>Volunteer</th><th>Shift</th><th>Attendance</th><th>Action</th></tr></thead>
          <tbody>
            {open.map(({ p, bd, att, attested, camp }) => {
              const spoof = bd.receiver_id !== p.proposer;
              const m = minutesOf(att);
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{spoof ? <><span className="pill bad">spoofed</span><div className="small mono">filed by {p.proposer}<br />names {bd.receiver_id}</div></> : <Link className="mono" to={`/v/${bd.receiver_id}`}>{bd.receiver_id}</Link>}</td>
                  <td className="small"><Link to={`/c/${bd.bounty_id}`}>{camp?.title ?? `bounty ${bd.bounty_id}`}</Link><div className="muted">{camp && `${nearStr(camp.amount)} NEAR`}</div></td>
                  <td>{spoof ? "—" : attested && m !== null ? <span className="pill ok">attested, {m} min</span> : att.in_ns ? <span className="pill warn">checked in only</span> : <span className="pill">no check-in yet</span>}</td>
                  <td>
                    {spoof ? (
                      <div className="notice bad small" style={{ margin: 0 }}>Don't vote on this. Rejecting it would delete {bd.receiver_id}'s claim and pay their bond to the filer (<a href="https://github.com/shanjiv177/muster/blob/main/docs/sputnik-findings.md#3-a-spoofed-bountydone-pays-the-bond-to-the-attacker">why</a>). Settle the real proposal and this one can never execute.</div>
                    ) : (
                      <div className="row">
                        <button className="btn sm ghost" disabled={!w.accountId} onClick={() => run(`settle #${p.id}`, DEP.impactTier, "settle", { proposal_id: p.id, bounty_id: bd.bounty_id, account: bd.receiver_id }, 300)}>Ask rules contract</button>
                        {isCouncil && <button className="btn sm" onClick={() => vote(p, "VoteApprove")}>Approve</button>}
                        {isCouncil && <button className="btn sm bad" title="Remove keeps the bond. Reject would refund it." onClick={() => vote(p, "VoteRemove")}>Remove (keep bond)</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!open.length && <tr><td colSpan={5} className="muted">Nothing waiting.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 20 }}>No Reject button: in Sputnik a reject refunds the bond (<a href="https://github.com/shanjiv177/muster/blob/main/docs/sputnik-findings.md#2-only-voteremove-forfeits-the-bond">why</a>).</p>

      {!!approvedUncredited.length && (
        <>
          <h2>Approved, waiting to be credited</h2>
          <div className="card">
            {approvedUncredited.map(({ p, bd }) => (
              <div className="row" key={p.id} style={{ marginBottom: 6 }}>
                <span>#{p.id} <Acct id={bd.receiver_id} /></span>
                <button className="btn sm" disabled={!w.accountId} onClick={() => run(`credit #${p.id}`, DEP.impactTier, "credit", { proposal_id: p.id, bounty_id: bd.bounty_id }, 150)}>Credit hours</button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Other open proposals</h2>
      <div className="card">
        {d.other.map((p) => (
          <div className="row" key={p.id} style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <span><StatusPill status={p.status} /> #{p.id} {Object.keys(p.kind)[0]}: {p.description.split("\n")[0]} <span className="small muted">by {p.proposer}</span></span>
            {isCouncil && <button className="btn sm" onClick={() => vote(p, "VoteApprove")}>Approve</button>}
          </div>
        ))}
        {!d.other.length && <p className="muted">None.</p>}
      </div>
    </>
  );
}
