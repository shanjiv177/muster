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
  return (
    <>
      <h1>Proof</h1>
      <p className="lead">Checked live against testnet, in your browser.</p>

      <h2>Live checks</h2>
      <Err e={error} />
      {loading ? <Loading /> : (
        <div>
          {data?.map((c, i) => (
            <div key={i} className={`check ${c.ok ? "ok" : "bad"}`}>
              <span className="tick" aria-label={c.ok ? "Pass" : "Fail"}>{c.ok ? "✓" : "✕"}</span>
              <span>{c.label}<small title={c.detail}>{c.detail}</small></span>
            </div>
          ))}
        </div>
      )}

      <h2>Every path, tested on testnet</h2>
      <div className="grid wide">
        <div className="card"><h3>Trusted volunteer</h3><p className="small muted">Auto-approved by the rules contract. <Link to={`/v/${DEP.volunteers.a}`}>Certificate</Link></p></div>
        <div className="card"><h3>First shift</h3><p className="small muted">One council vote, then credited. <Link to={`/v/${DEP.volunteers.b}`}>Certificate</Link></p></div>
        <div className="card"><h3>No-show</h3><p className="small muted">Removed. The bond stays in the DAO.</p></div>
        <div className="card"><h3>Gave up in time</h3><p className="small muted">Bond refunded.</p></div>
        <div className="card"><h3>Double RSVP</h3><p className="small muted">Reverts. No second bond.</p></div>
        <div className="card"><h3>Door code</h3><p className="small muted">Self check-in. Old codes fail.</p></div>
        <div className="card"><h3>Spoofed claim</h3><p className="small muted">Ignored, and can never pay out.</p></div>
      </div>

      <details className="more-info">
        <summary>Every transaction of the scripted run</summary>
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
      <p className="small muted">Reverted rows are attacks that are meant to fail. Accounts: DAO <a href={addrLink(DEP.dao)}>{DEP.dao}</a>, rules contract <a href={addrLink(DEP.impactTier)}>{DEP.impactTier}</a>. Re-check from a clone with <code>npm run judge</code>.</p>
      </details>
    </>
  );
}
