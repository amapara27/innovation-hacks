import { useWallet } from "@solana/wallet-adapter-react";
import GreenScoreDisplay from "@/components/dashboard/GreenScoreDisplay";
import CarbonFootprintChart from "@/components/dashboard/CarbonFootprintChart";
import { useGreenScore } from "@/hooks/useGreenScore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Zap, TreePine, Globe, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { publicKey } = useWallet();
  const { data: greenScore } = useGreenScore(
    publicKey?.toBase58() ?? null
  );

  const stats = [
    {
      label: "Total CO₂ Offset",
      value: "2,450 kg",
      icon: TreePine,
      change: "+12.5%",
    },
    {
      label: "Transactions Analyzed",
      value: "1,284",
      icon: Zap,
      change: "+8.3%",
    },
    {
      label: "Global Rank",
      value: `#${greenScore?.rank ?? "—"}`,
      icon: Globe,
      change: "Top 8%",
    },
    {
      label: "Staking APY",
      value: "8.2%",
      icon: TrendingUp,
      change: "+1.7% bonus",
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-stone-50">Dashboard</h1>
        <p className="text-stone-400 text-base tracking-wide">
          Track your sustainability impact on Solana
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => (
          <div key={stat.label} className="card-organic stat-glow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20">
                <stat.icon className="h-5 w-5 text-forest-400" strokeWidth={2.2} />
              </div>
            </div>
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-3xl font-display font-bold text-stone-100 tracking-tight">{stat.value}</p>
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-forest-400"></div>
                <p className="text-sm text-forest-400 font-medium">
                  {stat.change}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <CarbonFootprintChart />
        </div>
        <div>
          <GreenScoreDisplay score={greenScore?.score ?? 0} />
        </div>
      </div>
    </div>
  );
}
