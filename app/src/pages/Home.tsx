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
      {c && <p className="tc-source">Live from testnet, approved by {approvedBy}. <Link to={`/v/${c.o.account}`}>View certificate</Link></p>}
    </>
  );
}

function ShiftRow({ c }: { c: Campaign }) {
  const t = c.terms!;
  const open = Date.now() / 1000 < t.end;
  const d = new Date(t.start * 1000);
  return (
    <Link className={`shift${open ? "" : " past"}`} to={`/c/${c.id}`}>
      <div className="when"><b>{d.toLocaleDateString([], { day: "numeric" })}</b><span>{d.toLocaleDateString([], { month: "short" })}</span></div>
      <div className="what">
        <h3>{c.title}</h3>
        <div className="meta">{d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, {c.place}</div>
      </div>
      <div className="tags">
        <span className="pill">{nearStr(c.amount)} NEAR</span>
        {open ? <span className="pill ok">{c.times - c.claims} places</span> : <span className="pill">Ended</span>}
      </div>
    </Link>
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
          <p className="lead">RSVP with a refundable bond. Show up, get paid. Your hours live on chain.</p>
          <div className="row">
            <a className="btn primary lg" href="#shifts">Find a shift</a>
            <Link className="btn ghost lg" to="/proof">How we prove it</Link>
          </div>
        </div>
        <div style={{ display: "grid" }}>
          <Timecard d={d} />
        </div>
      </section>

      <Err e={error} />

      <section className="block">
        <h2>How it works</h2>
        <ol className="how">
          <li><span className="num">1</span><h3>RSVP</h3><p>Lock a {d ? nearStr(d.bond, 1) : "0.5"} NEAR bond.</p></li>
          <li><span className="num">2</span><h3>Show up</h3><p>Get scanned in and out.</p></li>
          <li><span className="num">3</span><h3>Get paid</h3><p>The DAO settles, on chain.</p></li>
        </ol>
      </section>

      <section className="block">
        <h2>Every RSVP ends one of three ways</h2>
        <div className="outcomes">
          <div className="paid"><span className="dot" /><h3>Showed up</h3><p>Stipend paid, bond back.</p></div>
          <div><span className="dot" /><h3>First shift</h3><p>One council vote, then automatic.</p></div>
          <div className="kept"><span className="dot" /><h3>No-show</h3><p>Bond stays with the community.</p></div>
        </div>
      </section>

      <section className="block">
        <h2>On testnet so far</h2>
        <div className="figures">
          <div><b>{d ? hours.toFixed(1) : "–"}</b><span>verified hours</span></div>
          <div><b>{d?.shiftsPaid ?? "–"}</b><span>shifts paid</span></div>
          <div><b>{d?.rsvps ?? "–"}</b><span>bonded RSVPs</span></div>
          <div><b>{d ? nearStr(d.kept, 1) : "–"}</b><span>NEAR kept from no-shows</span></div>
        </div>
        <p className="footnote">Demo shifts are a minute long. <Link to="/activity">See every decision</Link></p>
      </section>

      <section className="block" id="shifts">
        <div className="row spread">
          <h2>Shifts</h2>
          <Link className="btn ghost sm" to="/organiser/new">Propose a shift</Link>
        </div>
        <div className="shifts">
          {!d && <p className="muted">Loading shifts…</p>}
          {d && !open.length && <p className="muted">No open shifts right now.</p>}
          {open.map((c) => <ShiftRow key={c.id} c={c} />)}
        </div>
        {!!past.length && (
          <>
            <h3 className="sub">Past</h3>
            <div className="shifts">{(allPast ? past : past.slice(0, 3)).map((c) => <ShiftRow key={c.id} c={c} />)}</div>
            {past.length > 3 && !allPast && <button className="btn ghost sm more" onClick={() => setAllPast(true)}>Show all {past.length}</button>}
          </>
        )}
      </section>
    </>
  );
}
