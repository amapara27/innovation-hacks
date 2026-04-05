import { Routes, Route } from "react-router-dom";
import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import Dashboard from "@/pages/Dashboard";
import Staking from "@/pages/Staking";
import Swaps from "@/pages/Swaps";
import Leaderboard from "@/pages/Leaderboard";
import Sidebar from "@/components/layout/Sidebar";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";

import "@solana/wallet-adapter-react-ui/styles.css";

function AppContent() {
  const { isExpanded } = useSidebar();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 p-6 lg:p-8 transition-all duration-300 ${isExpanded ? "ml-64" : "ml-20"}`}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/staking" element={<Staking />} />
          <Route path="/swaps" element={<Swaps />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const endpoint = useMemo(() => clusterApiUrl("devnet"), []);
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SidebarProvider>
            <AppContent />
          </SidebarProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
