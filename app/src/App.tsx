import { HashRouter, NavLink, Route, Routes, Link } from "react-router-dom";
import { WalletProvider, useWallet } from "./wallet";
import Board from "./pages/Board";
import CampaignPage from "./pages/Campaign";
import Scan from "./pages/Scan";
import Council from "./pages/Council";
import Certificate from "./pages/Certificate";
import Proof from "./pages/Proof";
import NewCampaign from "./pages/NewCampaign";
import { DEP, addrLink } from "./chain";

function WalletButton() {
  const w = useWallet();
  if (!w.modal) return null;
  if (w.accountId)
    return (
      <span className="row small">
        <Link to={`/v/${w.accountId}`} style={{ color: "#fff" }} className="mono">{w.accountId}</Link>
        <button className="btn sm ghost" style={{ color: "#fff", borderColor: "#fff" }} onClick={async () => (await w.selector!.wallet()).signOut()}>Sign out</button>
      </span>
    );
  return <button className="btn sm sun" onClick={() => w.modal!.show()}>Sign in</button>;
}

function Shell() {
  return (
    <>
      <header className="top">
        <div className="inner">
          <Link className="brand" to="/">▲ <span>Mus<b>ter</b></span></Link>
          <nav>
            <NavLink to="/" end>Board</NavLink>
            <NavLink to="/council">Council</NavLink>
            <NavLink to="/organiser/new">New campaign</NavLink>
            <NavLink to="/proof">Proof</NavLink>
          </nav>
          <span className="net">testnet</span>
          <WalletButton />
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/c/:id" element={<CampaignPage />} />
          <Route path="/organiser/scan/:id" element={<Scan />} />
          <Route path="/organiser/new" element={<NewCampaign />} />
          <Route path="/council" element={<Council />} />
          <Route path="/v/:account" element={<Certificate />} />
          <Route path="/proof" element={<Proof />} />
        </Routes>
      </main>
      <footer>
        Community DAO <a href={addrLink(DEP.dao)}>{DEP.dao}</a> (stock Sputnik v2) · rules contract <a href={addrLink(DEP.impactTier)}>{DEP.impactTier}</a> (no keys) · <a href="https://github.com/shanjiv177/muster">source</a>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </WalletProvider>
  );
}
