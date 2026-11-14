import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QrScanner from "qr-scanner";
import { DEP, RELAYER_URL, bountyDone, campaigns, organisersOf, policy, proposals, txLink } from "../chain";
import { addScopedKey, attestWithScopedKey, scopedKeyActive, useWallet } from "../wallet";
import { Err, Loading, useAsync } from "../ui";

type Kind = "In" | "Out";
interface LogLine { at: string; who: string; kind: Kind; ok: boolean; text: string; hash?: string }

export default function Scan() {
  const id = Number(useParams().id);
  const w = useWallet();
  const me = w.accountId;
  const { data: d, error, loading, reload } = useAsync(async () => {
    const [pol, camps, props] = await Promise.all([policy(), campaigns(), proposals()]);
    const rsvps = props.filter((p) => bountyDone(p)?.bounty_id === id && bountyDone(p)!.receiver_id === p.proposer && p.status === "InProgress").map((p) => p.proposer);
    return { isOrganiser: !!me && organisersOf(pol).includes(me), camp: camps.find((c) => c.id === id), rsvps, keyOk: me ? await scopedKeyActive(me) : false };
  }, [id, me]);
  const [kind, setKind] = useState<Kind>("In");
  const [manual, setManual] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const recent = useRef(new Map<string, number>());
  const kindRef = useRef(kind);
  kindRef.current = kind;

  async function attest(who: string) {
    const k = kindRef.current;
    const key = `${who}:${k}`;
    if (Date.now() - (recent.current.get(key) ?? 0) < 15_000) return; // the camera sees the same code many times
    recent.current.set(key, Date.now());
    const at = new Date().toLocaleTimeString();
    try {
      const r = await attestWithScopedKey(me!, id, who, k);
      setLog((l) => [{ at, who, kind: k, ok: true, text: `checked ${k === "In" ? "in" : "out"} (${r.via})`, hash: r.hash }, ...l]);
    } catch (e: any) {
      recent.current.delete(key);
      setLog((l) => [{ at, who, kind: k, ok: false, text: String(e?.message ?? e) }, ...l]);
    }
  }

  function onCode(text: string) {
    const m = /^muster:(\d+):([a-z0-9._-]+)$/.exec(text.trim());
    if (!m) return;
    if (Number(m[1]) !== id) {
      setLog((l) => [{ at: new Date().toLocaleTimeString(), who: m[2], kind: kindRef.current, ok: false, text: `code is for bounty #${m[1]}, not #${id}` }, ...l]);
      return;
    }
    attest(m[2]);
  }

  async function startCamera() {
    if (!video.current) return;
    scanner.current = new QrScanner(video.current, (r) => onCode(r.data), { returnDetailedScanResult: true, highlightScanRegion: true });
    await scanner.current.start();
    setScanning(true);
  }
  useEffect(() => () => scanner.current?.destroy(), []);

  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading />;

  return (
    <>
      <Link className="back" to={`/c/${id}`}>{d.camp?.title ?? `Shift ${id}`}</Link>
      <h1>Organiser check-in</h1>
      <p className="lead">Scan each volunteer's code on arrival (<b>In</b>) and departure (<b>Out</b>). The minutes between them are what the DAO pays for and what goes on the volunteer's certificate.</p>

      {!me && <button className="btn" onClick={() => w.modal?.show()}>Sign in as organiser</button>}
      {me && !d.isOrganiser && <div className="notice bad"><span className="mono">{me}</span> is not in the DAO's <code>organiser</code> role, so impact-tier will refuse its check-ins.</div>}

      {me && d.isOrganiser && !d.keyOk && (
        <div className="card">
          <h3>One-time setup: a check-in key for this phone</h3>
          <p className="small">Muster makes a key in this browser and asks your wallet to add it to <span className="mono">{me}</span> as a <b>FunctionCall access key</b>. It can only call <code>attest</code> and <code>set_door_key</code> on <span className="mono">{DEP.impactTier}</span>, so it can't move money. After this, scanning needs no wallet pop-ups{RELAYER_URL ? " and no gas: the relayer pays" : ""}.</p>
          <button className="btn" onClick={async () => { await addScopedKey(w); reload(); }}>Add check-in key</button>
        </div>
      )}

      {me && d.isOrganiser && d.keyOk && (
        <div className="grid wide">
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <button className={`btn ${kind === "In" ? "" : "ghost"}`} onClick={() => setKind("In")}>Check in</button>
              <button className={`btn ${kind === "Out" ? "" : "ghost"}`} onClick={() => setKind("Out")}>Check out</button>
              <span className="pill ok">key active</span>
            </div>
            <video ref={video} className="scan" muted playsInline />
            {!scanning && <div><button className="btn sun" onClick={startCamera}>Start camera</button></div>}
            <label>Or type an account</label>
            <div className="row">
              <input list="rsvps" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="volunteer.testnet" style={{ flex: 1 }} />
              <datalist id="rsvps">{d.rsvps.map((r) => <option key={r} value={r} />)}</datalist>
              <button className="btn" disabled={!manual} onClick={() => { attest(manual.trim()); setManual(""); }}>{kind === "In" ? "Check in" : "Check out"}</button>
            </div>
          </div>
          <div className="card">
            <h3>This session</h3>
            {!log.length && <p className="muted small">Scans appear here with their transactions.</p>}
            {log.map((l, i) => (
              <div key={i} className={`notice ${l.ok ? "ok" : "bad"} small`}>
                {l.at}, {l.who}: {l.text} {l.hash && <a href={txLink(l.hash)} target="_blank" rel="noreferrer">tx</a>}
              </div>
            ))}
            <p className="small muted">{d.rsvps.length} open RSVPs on this shift. For a busy entrance, put up a <Link to={`/organiser/door/${id}`}>rotating door code</Link> and let volunteers check themselves in.</p>
          </div>
        </div>
      )}
    </>
  );
}
