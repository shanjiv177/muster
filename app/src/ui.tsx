import { useCallback, useEffect, useState, type ReactNode } from "react";
import { addrLink } from "./chain";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, set] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const run = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    fn().then((data) => set({ data, loading: false })).catch((e) => set({ error: String(e?.message ?? e), loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export const Acct = ({ id }: { id: string }) => <a className="mono" href={addrLink(id)} target="_blank" rel="noreferrer">{id}</a>;

export function Loading({ what = "chain data" }: { what?: string }) {
  return <p className="muted">Reading {what} from testnet…</p>;
}

export function Err({ e }: { e?: string }) {
  return e ? <div className="notice bad">{e}</div> : null;
}

export function Stat({ n, l }: { n: ReactNode; l: string }) {
  return <div className="card stat"><div className="n">{n}</div><div className="l">{l}</div></div>;
}

export function StatusPill({ status }: { status: string }) {
  const cls = status === "Approved" || status === "approved" || status === "credited" ? "ok" : status === "InProgress" || status === "waiting" ? "warn" : status === "removed" || status === "Removed" || status === "Rejected" ? "bad" : "";
  return <span className={`pill ${cls}`}>{status === "InProgress" ? "open" : status}</span>;
}
