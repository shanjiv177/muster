import { HashRouter, NavLink, Route, Routes, Link } from "react-router-dom";
import { WalletProvider, useWallet } from "./wallet";
import Home from "./pages/Home";
import Activity from "./pages/Activity";
import CampaignPage from "./pages/Campaign";
import Scan from "./pages/Scan";
import Door from "./pages/Door";
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
        <Link to={`/v/${w.accountId}`}>{w.accountId}</Link>
        <button className="btn sm ghost" onClick={async () => (await w.selector!.wallet()).signOut()}>Sign out</button>
      </span>
    );
  return <button className="btn sm" onClick={() => w.modal!.show()}>Sign in</button>;
}

function Shell() {
  return (
    <>
      <header className="top">
        <div className="inner">
          <Link className="brand" to="/"><span className="brand-mark" aria-hidden />Muster</Link>
          <nav>
            <NavLink to="/" end>Shifts</NavLink>
            <NavLink to="/activity">Activity</NavLink>
            <NavLink to="/council">Council</NavLink>
            <NavLink to="/proof">Proof</NavLink>
          </nav>
          <span className="net">NEAR testnet</span>
          <WalletButton />
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/c/:id" element={<CampaignPage />} />
          <Route path="/organiser/scan/:id" element={<Scan />} />
          <Route path="/organiser/door/:id" element={<Door />} />
          <Route path="/organiser/new" element={<NewCampaign />} />
          <Route path="/council" element={<Council />} />
          <Route path="/v/:account" element={<Certificate />} />
          <Route path="/proof" element={<Proof />} />
        </Routes>
      </main>
      <footer>
        <span>Muster</span>
        <nav>
          <a href={addrLink(DEP.dao)}>DAO</a>
          <a href={addrLink(DEP.impactTier)}>Rules contract</a>
          <a href="https://github.com/shanjiv177/muster">GitHub</a>
        </nav>
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
