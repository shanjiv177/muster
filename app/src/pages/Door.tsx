import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { DEP, campaigns, organisersOf, policy, txLink, view } from "../chain";
import { SLOT_SECS, currentSlot, doorKey, doorPayload, type Kind } from "../door";
import { scopedCall, scopedKeyActive, useWallet } from "../wallet";
import { Err, Loading, useAsync } from "../ui";

/** The screen at the venue: a QR code that changes every 30 seconds. */
export default function Door() {
  const id = Number(useParams().id);
  const w = useWallet();
  const me = w.accountId;
  const kp = doorKey(id);
  const pub = kp.getPublicKey().toString();
  const { data: d, error, loading, reload } = useAsync(async () => {
    const [pol, camps, door] = await Promise.all([policy(), campaigns(), view<any>(DEP.impactTier, "door_of", { bounty_id: id })]);
    return { camp: camps.find((c) => c.id === id), isOrganiser: !!me && organisersOf(pol).includes(me), keyOk: me ? await scopedKeyActive(me) : false, registered: door?.public_key === pub, door };
  }, [id, me]);
  const [kind, setKind] = useState<Kind>("In");
  const [slot, setSlot] = useState(currentSlot());
  const [left, setLeft] = useState(0);
  const [src, setSrc] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now() / 1000;
      setSlot(Math.floor(now / SLOT_SECS));
      setLeft(Math.ceil(SLOT_SECS - (now % SLOT_SECS)));
    }, 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    QRCode.toDataURL(doorPayload(kp, id, kind, slot), { width: 520, margin: 1, errorCorrectionLevel: "M" }).then(setSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, kind, id]);

  async function register() {
    setMsg(null);
    try {
      const r = await scopedCall(me!, "set_door_key", { bounty_id: id, public_key: pub });
      setMsg({ ok: true, text: "Door key registered for this shift.", hash: r.hash });
      reload();
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
  }

  if (error) return <Err e={error} />;
  if (loading || !d) return <Loading />;
  const ready = d.registered;

  return (
    <>
      <Link className="back" to={`/organiser/scan/${id}`}>Organiser check-in</Link>
      <h1>{d.camp?.title ?? `Shift ${id}`}: door code</h1>
      <p className="lead">Put this at the entrance. It changes every {SLOT_SECS} seconds.</p>

      {!ready && (
        <div className="card">
          <h3>Register this screen for the shift</h3>
          <p className="small muted">This browser made a door key for shift {id}. Registering it tells the rules contract to accept codes signed by this screen as your check-ins.{d.door ? " It replaces the door key registered earlier." : ""}</p>
          {!me ? <button className="btn" onClick={() => w.modal?.show()}>Sign in as organiser</button>
            : !d.isOrganiser ? <div className="notice bad">{me} is not in the DAO's organiser role.</div>
            : !d.keyOk ? <div className="notice">Add a check-in key first on the <Link to={`/organiser/scan/${id}`}>organiser check-in page</Link>.</div>
            : <button className="btn primary" onClick={register}>Register door key</button>}
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">View transaction</a>}</div>}
        </div>
      )}

      {ready && (
        <div className="door">
          <div className="row" style={{ justifyContent: "center", marginBottom: 18 }}>
            <button className={`btn ${kind === "In" ? "" : "ghost"}`} onClick={() => setKind("In")}>Arriving</button>
            <button className={`btn ${kind === "Out" ? "" : "ghost"}`} onClick={() => setKind("Out")}>Leaving</button>
          </div>
          <div className="door-qr">{src && <img src={src} alt={`Door code for ${kind === "In" ? "checking in" : "checking out"}`} />}</div>
          <div className="door-bar" aria-hidden><span style={{ width: `${(left / SLOT_SECS) * 100}%` }} /></div>
          <p className="door-caption">{kind === "In" ? "Scan to check in" : "Scan to check out"}. New code in {left} s.</p>
          <button className="btn ghost sm" style={{ marginTop: 18 }} onClick={async () => { await navigator.clipboard.writeText(doorPayload(kp, id, kind, slot)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy code"}</button>
          <p className="small muted" style={{ marginTop: 10 }}>For volunteers without a camera: they paste this on the shift page.</p>
        </div>
      )}
    </>
  );
}
