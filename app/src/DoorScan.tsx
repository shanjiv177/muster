import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { DEP, txLink } from "./chain";
import { parseDoor } from "./door";
import { outcomeError, outcomeHash, useWallet, walletCall } from "./wallet";

/** Volunteer scans the rotating door code and checks themselves in or out. */
export default function DoorScan({ bountyId, onDone }: { bountyId: number; onDone: () => void }) {
  const w = useWallet();
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);

  async function submit(text: string) {
    const code = parseDoor(text);
    if (!code || busy.current) return;
    if (code.bounty_id !== bountyId) { setMsg({ ok: false, text: "That door code is for a different shift." }); return; }
    busy.current = true;
    scanner.current?.stop();
    setOpen(false);
    try {
      const out = await walletCall(w, DEP.impactTier, [{ method: "self_attest", args: code, tgas: 30 }]);
      const err = outcomeError(out);
      const verb = code.kind === "In" ? "Checked in" : "Checked out";
      setMsg(err ? { ok: false, text: err.includes("ERR_CODE_EXPIRED") ? "That code has expired. Scan the screen again." : err.includes("ERR_NO_CHECK_IN") ? "Check in first, then check out when you leave." : err } : { ok: true, text: `${verb}.`, hash: outcomeHash(out) });
      onDone();
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message ?? e) }); }
    busy.current = false;
  }

  useEffect(() => {
    if (!open || !video.current) return;
    scanner.current = new QrScanner(video.current, (r) => submit(r.data), { returnDetailedScanResult: true, highlightScanRegion: true });
    scanner.current.start().catch((e) => setMsg({ ok: false, text: `Camera unavailable: ${e}` }));
    return () => scanner.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div>
      {!open && (
        <div className="row">
          <button className="btn primary" onClick={() => { setMsg(null); setTyping(false); setOpen(true); }}>Scan the door code</button>
          <button className="btn ghost" onClick={() => setTyping((t) => !t)}>Enter code instead</button>
        </div>
      )}
      {typing && !open && (
        <div className="row" style={{ marginTop: 14 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from the door screen" style={{ flex: 1 }} />
          <button className="btn" disabled={!code.trim()} onClick={() => { const c = code; setCode(""); if (!parseDoor(c)) setMsg({ ok: false, text: "That isn't a door code." }); else submit(c); }}>Submit</button>
        </div>
      )}
      {open && (
        <>
          <video ref={video} className="scan" muted playsInline />
          <div><button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button></div>
        </>
      )}
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.hash && <a href={txLink(msg.hash)} target="_blank" rel="noreferrer">View transaction</a>}</div>}
    </div>
  );
}
