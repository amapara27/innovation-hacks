import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  Trophy,
  Coins,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSidebar } from "@/contexts/SidebarContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/staking", label: "Staking", icon: Landmark },
  { to: "/swaps", label: "Swaps", icon: ArrowLeftRight },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function Sidebar() {
  const { isExpanded, setIsExpanded } = useSidebar();

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen border-r border-stone-800/80 bg-surface-950/90 backdrop-blur-xl flex flex-col transition-all duration-300 ${
        isExpanded ? "w-64" : "w-20"
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 py-7 border-b border-stone-800/80 ${isExpanded ? "px-6" : "px-4 justify-center"}`}>
        <div className="relative flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-forest-500 to-forest-700 shadow-lg shadow-forest-900/50 flex-shrink-0">
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/10 to-transparent"></div>
          <Coins className="h-5 w-5 text-white relative z-10" strokeWidth={2.5} />
        </div>
        {isExpanded && (
          <div className="overflow-hidden">
            <h1 className="text-lg font-display font-bold gradient-text tracking-tight">CarbonIQ</h1>
            <p className="text-[10px] font-mono text-earth-400 tracking-wider uppercase mt-0.5">
              Solana · Devnet
            </p>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3 top-24 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-surface-900 border border-stone-700 hover:bg-surface-800 hover:border-forest-600/50 transition-all duration-300 shadow-lg"
      >
        {isExpanded ? (
          <ChevronLeft className="h-3 w-3 text-stone-400" strokeWidth={2.5} />
        ) : (
          <ChevronRight className="h-3 w-3 text-stone-400" strokeWidth={2.5} />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-300 ${
                isExpanded ? "px-4 py-3.5" : "px-4 py-3.5 justify-center"
              } ${
                isActive
                  ? "bg-gradient-to-br from-forest-600/25 to-forest-700/15 text-forest-300 border border-forest-600/40 shadow-md shadow-forest-900/20"
                  : "text-stone-400 hover:text-stone-200 hover:bg-surface-900/60 border border-transparent"
              }`
            }
            title={!isExpanded ? label : undefined}
          >
            <Icon className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 flex-shrink-0`} strokeWidth={2} />
            {isExpanded && <span className="tracking-wide">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Wallet */}
      <div className={`p-4 border-t border-stone-800/80 ${!isExpanded && "px-2"}`}>
        <WalletMultiButton className={`!w-full !rounded-lg !bg-surface-900/60 !border !border-stone-800 !text-sm !font-medium hover:!bg-surface-800 hover:!border-earth-600 !transition-all !duration-300 ${
          isExpanded ? "!justify-center" : "!justify-center !px-2"
        }`} />
      </div>
    </aside>
  );
}
