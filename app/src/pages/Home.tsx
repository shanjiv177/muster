import { useState } from "react";
import { Link } from "react-router-dom";
import { DEP, attendanceOf, balanceOf, bountyDone, campaigns, nearStr, outcomes, policy, proposals, type Campaign } from "../chain";
import { Err, useAsync } from "../ui";

const clock = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });

async function load() {
  const [camps, props, outs, pol, treasury] = await Promise.all([campaigns(), proposals(), outcomes(), policy(), balanceOf(DEP.dao)]);
  const paid = outs.filter((o) => o.outcome === "approved" || o.outcome === "credited");
  const latest = paid[paid.length - 1];
  const card = latest ? { o: latest, att: await attendanceOf(latest.bounty_id, latest.account), camp: camps.find((c) => c.id === latest.bounty_id) } : null;
  const own = props.filter((p) => { const bd = bountyDone(p); return bd && bd.receiver_id === p.proposer; });
  return {
    card,
    camps: camps.filter((c) => c.terms),
    minutes: paid.reduce((s, o) => s + o.minutes, 0),
    shiftsPaid: own.filter((p) => p.status === "Approved").length,
    rsvps: own.length + outs.filter((o) => o.outcome === "removed").length,
    kept: BigInt(pol.bounty_bond) * BigInt(outs.filter((o) => o.outcome === "removed").length),
    bond: BigInt(pol.bounty_bond),
    treasury,
  };
}

function Timecard({ d }: { d: Awaited<ReturnType<typeof load>> | undefined }) {
  const c = d?.card;
  const approvedBy = c?.o.outcome === "approved" ? "the rules contract" : "a council vote";
  return (
    <>
      <figure className="timecard" aria-label="A verified shift, as a timecard">
        <div className="tc-head">
          <b>{c?.camp?.title ?? "Juhu Beach cleanup"}</b>
          <span>{c?.att.in_ns ? day(c.att.in_ns) : "Shift"}</span>
        </div>
        <div className="tc-name">{c?.o.account ?? "volunteer.testnet"}</div>
        <table className="tc-rows">
          <tbody>
            <tr><td>Checked in by {c?.att.in_by ?? "the organiser"}</td><td className="t">{c?.att.in_ns ? clock(c.att.in_ns) : "--:--"}</td></tr>
            <tr><td>Checked out</td><td className="t">{c?.att.out_ns ? clock(c.att.out_ns) : "--:--"}</td></tr>
          </tbody>
        </table>
        <div className="tc-total"><span>Time on site</span><span className="t">{c ? `${c.o.minutes} min` : "…"}</span></div>
        <div className="tc-sign">Approved</div>
        {c && <div className="stamp">PAID BY THE DAO<small>proposal #{c.o.proposal_id}</small></div>}
      </figure>
      {c && <p className="tc-source">A real shift on NEAR testnet, read live. Approved by {approvedBy}. <Link to={`/v/${c.o.account}`}>See the certificate</Link></p>}
    </>
  );
}

function ShiftRow({ c }: { c: Campaign }) {
  const t = c.terms!;
  const open = Date.now() / 1000 < t.end;
  const when = new Date(t.start * 1000).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="shift">
      <div>
        <h3><Link to={`/c/${c.id}`}>{c.title}</Link></h3>
        <div className="meta">{c.place}, {when}. {c.times - c.claims} of {c.times} places left, {nearStr(c.amount)} NEAR stipend.</div>
      </div>
      <div className="row">
        {open ? <Link className="btn sm" to={`/c/${c.id}`}>RSVP</Link> : <span className="pill">Ended</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: d, error } = useAsync(load);
  const [allPast, setAllPast] = useState(false);
  const now = Date.now() / 1000;
  const open = d ? d.camps.filter((c) => now < c.terms!.end).reverse() : [];
  const past = d ? d.camps.filter((c) => now >= c.terms!.end).reverse() : [];
  const hours = d ? d.minutes / 60 : 0;
  return (
    <>
      <section className="hero">
        <div>
          <h1>Volunteer hours you can prove.</h1>
          <p className="lead">
            RSVP with a small refundable bond. An organiser checks you in and out. Your community's DAO pays the shift and writes the hours to a record anyone can check. If you don't turn up, the bond stays with the community.
          </p>
          <div className="row">
            <a className="btn primary" href="#shifts">Find a shift</a>
            <Link className="btn ghost" to="/proof">See the proof</Link>
          </div>
        </div>
        <div style={{ display: "grid" }}>
          <Timecard d={d} />
        </div>
      </section>

      <Err e={error} />

      <h2 style={{ marginTop: 0 }}>How a shift works</h2>
      <ol className="how">
        <li><span className="num">1</span><h3>RSVP once</h3><p>One transaction locks a {d ? nearStr(d.bond, 1) : "0.5"} NEAR bond and files your payout claim. On the day you just show a QR code.</p></li>
        <li><span className="num">2</span><h3>Get checked in and out</h3><p>The organiser scans you on arrival and departure. The minutes between the two scans are your hours.</p></li>
        <li><span className="num">3</span><h3>The DAO settles</h3><p>A rules contract with no owner reads the attendance and votes on your claim. Nobody can quietly change the rules.</p></li>
      </ol>

      <h2>Three ways a shift ends</h2>
      <div className="outcomes">
        <div className="paid"><h3>You showed up</h3><p>Stipend paid and bond returned. After your first verified shift this happens automatically.</p></div>
        <div><h3>It's your first shift</h3><p>One council member confirms it. Your record starts there.</p></div>
        <div className="kept"><h3>You didn't show</h3><p>The rules contract removes your claim. The bond stays in the community's treasury.</p></div>
      </div>

      <h2>So far, on testnet</h2>
      <div className="figures">
        <div><b>{d ? hours.toFixed(1) : "–"}</b><span>verified hours</span></div>
        <div><b>{d?.shiftsPaid ?? "–"}</b><span>shifts paid</span></div>
        <div><b>{d?.rsvps ?? "–"}</b><span>bonded RSVPs</span></div>
        <div><b>{d ? nearStr(d.kept, 1) : "–"}</b><span>NEAR kept from no-shows</span></div>
        <div><b>{d ? nearStr(d.treasury, 1) : "–"}</b><span>NEAR in the treasury</span></div>
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>The demo shifts last a minute or two so the scripted run finishes quickly. <Link to="/activity">Every decision the rules contract made</Link>.</p>

      <h2 id="shifts">Shifts</h2>
      <div className="shifts">
        {!d && <p className="muted">Reading shifts from testnet…</p>}
        {d && !open.length && <p className="muted">No open shifts right now. Organisers can propose one below.</p>}
        {open.map((c) => <ShiftRow key={c.id} c={c} />)}
      </div>
      {!!past.length && (
        <>
          <h3 style={{ marginTop: 36 }}>Past shifts</h3>
          <div className="shifts">{(allPast ? past : past.slice(0, 3)).map((c) => <ShiftRow key={c.id} c={c} />)}</div>
          {past.length > 3 && !allPast && <button className="btn ghost sm more" onClick={() => setAllPast(true)}>Show all {past.length} past shifts</button>}
        </>
      )}
      <p className="small muted">Organising one? <Link to="/organiser/new">Propose a shift</Link> to the council.</p>
    </>
  );
}
