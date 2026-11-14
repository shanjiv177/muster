import { Link } from "react-router-dom";
import runMd from "../../../docs/testnet-run.md?raw";
import { DEP, addrLink, provider, view } from "../chain";
import { Err, Loading, useAsync } from "../ui";

interface Check { label: string; ok: boolean; detail: string }

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function liveChecks(): Promise<Check[]> {
  const [daoAcct, defaultHash, fi, pol, keys, tcfg]: any[] = await Promise.all([
    provider.viewAccount({ accountId: DEP.dao }),
    view<string>(DEP.factory, "get_default_code_hash"),
    view(DEP.dao, "get_factory_info"),
    view(DEP.dao, "get_policy"),
    provider.viewAccessKeyList({ accountId: DEP.impactTier } as any),
    view(DEP.impactTier, "get_config"),
  ]);
  const role = (n: string) => pol.roles.find((r: any) => r.name === n);
  const tier = role("tier"), vol = role("volunteers");
  return [
    { label: "The DAO runs stock Sputnik code from the factory", ok: daoAcct.code_hash === defaultHash, detail: daoAcct.code_hash },
    { label: "Factory auto-update is off: only the DAO's own vote can change its code", ok: fi.auto_update === false, detail: JSON.stringify(fi) },
    { label: "The rules contract has no access keys: nobody can change it", ok: keys.keys.length === 0, detail: `${keys.keys.length} keys` },
    { label: "The tier role holds only the rules contract", ok: sameSet(tier?.kind?.Group ?? [], [DEP.impactTier]), detail: JSON.stringify(tier?.kind) },
    { label: "…and may only VoteApprove or VoteRemove shift proposals", ok: sameSet(tier?.permissions ?? [], ["bounty_done:VoteApprove", "bounty_done:VoteRemove"]), detail: (tier?.permissions ?? []).join(", ") },
    { label: "Volunteers (anyone) may only file shift proposals", ok: vol?.kind === "Everyone" && sameSet(vol.permissions, ["bounty_done:AddProposal"]), detail: vol?.permissions?.join(", ") },
    { label: "The rules contract serves this DAO", ok: tcfg.dao === DEP.dao, detail: tcfg.dao },
  ];
}

function parseRun(md: string) {
  return md.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Step") && !l.startsWith("|---")).map((l) => {
    const cells = l.slice(2, -2).split(" | ");
    const tx = /\((https:[^)]+)\)/.exec(cells[2] ?? "")?.[1];
    return { step: cells[0].replace(/\*\*/g, ""), result: cells[1] ?? "", tx };
  });
}

export default function Proof() {
  const { data, error, loading } = useAsync(liveChecks);
  const rows = parseRun(runMd);
  const P = DEP.run.proposals;
  return (
    <>
      <h1>Proof, without a wallet</h1>
      <p className="lead">These checks run in your browser against testnet right now. Below them is the scripted run (<code>npm run simulate</code>) that exercised every path, with a link for each transaction.</p>

      <h2>Live checks</h2>
      <Err e={error} />
      {loading ? <Loading /> : (
        <div className="card">
          {data?.map((c, i) => (
            <div key={i} className="row" style={{ marginBottom: 6, alignItems: "flex-start" }}>
              <span className={`pill ${c.ok ? "ok" : "bad"}`}>{c.ok ? "PASS" : "FAIL"}</span>
              <span>{c.label}<div className="small muted mono" style={{ wordBreak: "break-all" }}>{c.detail}</div></span>
            </div>
          ))}
        </div>
      )}

      <h2>The seven paths</h2>
      <div className="grid wide">
        <div className="card"><h3>A. trusted, attended</h3><p className="small">Second verified shift. The rules contract votes <b>Approve</b> on proposal #{P.A2}, and the DAO pays the stipend and returns the bond. No human vote. <Link to={`/v/${DEP.volunteers.a}`}>Certificate</Link></p></div>
        <div className="card"><h3>B. new, attended</h3><p className="small">The first shift waits for one council vote (#{P.B}); then <code>credit</code> adds it to the record. <Link to={`/v/${DEP.volunteers.b}`}>Certificate</Link></p></div>
        <div className="card"><h3>C. no-show</h3><p className="small">No check-in by end + grace. The rules contract votes <b>Remove</b> on #{P.C}: the proposal is deleted and the 0.51 NEAR stays in the DAO. A <i>Reject</i> would have refunded it.</p></div>
        <div className="card"><h3>D. gave up in time</h3><p className="small"><code>bounty_giveup</code> within 24 h of the RSVP refunds the bond. The leftover proposal #{P.D} has no claim, so the rules contract leaves it alone.</p></div>
        <div className="card"><h3>E. double RSVP</h3><p className="small">The second one-transaction RSVP reverts as a unit (<code>ERR_BOUNTY_CLAIM_COMPLETED</code>). No second bond, no second proposal.</p></div>
        <div className="card"><h3>G. door code check-in</h3><p className="small">G checks in and out by scanning a rotating QR on the organiser's screen (#{P.G}). The contract verifies the screen's signature and that the code is under two minutes old; a replayed code and a code from another shift both fail.</p></div>
        <div className="card"><h3>F. spoofed proposal</h3><p className="small">F files <code>BountyDone</code> naming B (#{P.F}). Rejecting it would pay B's bond to F. The rules contract ignores it, B is settled first, and after that the reject reverts.</p></div>
      </div>

      <h2>Scripted run, step by step</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Step</th><th>Result</th><th>Tx</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="small">{r.step}</td>
                <td className="small">{r.result.startsWith("PASS") ? <span className="pill ok">PASS</span> : r.result.startsWith("FAIL") || r.result.startsWith("failed") ? <span className="pill bad">{r.result.startsWith("FAIL") ? "FAIL" : "reverted"}</span> : null} <span className="mono" style={{ wordBreak: "break-all" }}>{r.result.replace(/^(PASS|FAIL) ?/, "").slice(0, 140)}</span></td>
                <td>{r.tx && <a href={r.tx} target="_blank" rel="noreferrer">tx</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Reverted rows are the attacks and mistakes that are supposed to fail. Accounts: DAO <a href={addrLink(DEP.dao)}>{DEP.dao}</a>, rules contract <a href={addrLink(DEP.impactTier)}>{DEP.impactTier}</a>. Re-check from a clone with <code>npm run judge</code>.</p>
    </>
  );
}
