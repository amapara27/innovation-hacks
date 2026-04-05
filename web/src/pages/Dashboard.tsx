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

  const tickerStats = [
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
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-stone-50">Dashboard</h1>
        <p className="text-stone-400 text-base tracking-wide">
          Track your sustainability impact on Solana
        </p>
      </div>

      {/* F-Pattern Layout: Hero Metric + Ticker */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Hero Metric: Green Score - 45.83% width (5.5/12) */}
        <div className="lg:w-[45.83%]">
          <GreenScoreDisplay score={greenScore?.score ?? 75} />
        </div>

        {/* Horizontal Ticker Stats - 54.17% width (6.5/12) */}
        <div className="lg:w-[54.17%] flex flex-col gap-3">
          {tickerStats.map((stat) => (
            <div
              key={stat.label}
              className="card-organic p-4 flex items-center gap-4 hover:scale-[1.01] transition-transform duration-300"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20 flex-shrink-0">
                <stat.icon className="h-4 w-4 text-forest-400" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                  {stat.label}
                </p>
                <p className="text-2xl font-display font-bold text-stone-100 tracking-tight">
                  {stat.value}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="h-1 w-1 rounded-full bg-forest-400"></div>
                <p className="text-sm text-forest-400 font-medium whitespace-nowrap">
                  {stat.change}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Width Chart */}
      <div>
        <CarbonFootprintChart />
      </div>
    </div>
  );
}
