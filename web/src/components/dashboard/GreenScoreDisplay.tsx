import { Progress } from "@/components/ui/Progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { TrendingUp, Award } from "lucide-react";

interface GreenScoreDisplayProps {
  score: number; // 0–100
  label?: string;
  currentOffset?: number; // Current CO2 offset in kg
}

export default function GreenScoreDisplay({
  score,
  label = "Green Score",
  currentOffset = 2450,
}: GreenScoreDisplayProps) {
  // Tier thresholds
  const tiers = [
    { name: "Bronze", min: 0, max: 40, color: "text-clay-400", bgColor: "bg-clay-400/10", borderColor: "border-clay-400/30" },
    { name: "Silver", min: 40, max: 60, color: "text-stone-300", bgColor: "bg-stone-300/10", borderColor: "border-stone-300/30" },
    { name: "Gold", min: 60, max: 80, color: "text-solar-400", bgColor: "bg-solar-400/10", borderColor: "border-solar-400/30" },
    { name: "Platinum", min: 80, max: 100, color: "text-forest-300", bgColor: "bg-forest-300/10", borderColor: "border-forest-300/30" },
  ];

  const currentTier = tiers.find(t => score >= t.min && score < t.max) || tiers[tiers.length - 1];
  const nextTier = tiers.find(t => t.min > score);

  // Calculate progress to next tier
  const tierProgress = nextTier
    ? ((score - currentTier.min) / (nextTier.min - currentTier.min)) * 100
    : 100;

  // Calculate kg needed (approximate: 1 score point = ~100kg offset)
  const kgNeeded = nextTier ? Math.round((nextTier.min - score) * 100) : 0;

  return (
    <Card className="relative overflow-hidden h-full">
      {/* Background glow */}
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-15 blur-3xl"
        style={{
          background: `radial-gradient(circle, rgba(107, 155, 107, 0.5) 0%, rgba(168, 137, 104, 0.3) 50%, transparent 70%)`,
        }}
      />

      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-forest-600/20 to-earth-600/15 border border-forest-600/20">
            <Award className="h-4 w-4 text-forest-400" strokeWidth={2.5} />
          </div>
          <span className="font-display">{label}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6 relative">
        {/* Hero Score */}
        <div className="flex items-end gap-3">
          <span className="text-6xl font-display font-extrabold gradient-text tabular-nums">
            {score}
          </span>
          <span className="text-base text-stone-500 pb-3 font-medium">/ 100</span>
        </div>

        {/* Current Tier Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${currentTier.bgColor} border ${currentTier.borderColor}`}>
          <Award className={`h-4 w-4 ${currentTier.color}`} strokeWidth={2.5} />
          <span className={`font-display font-bold text-sm ${currentTier.color}`}>
            {currentTier.name} Tier
          </span>
        </div>

        {/* Tier Progress */}
        {nextTier && (
          <div className="space-y-3 p-4 rounded-lg bg-surface-900/40 border border-stone-800/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Next Tier: {nextTier.name}
              </span>
              <span className="text-xs text-stone-400 font-medium">
                {Math.round(tierProgress)}%
              </span>
            </div>

            <Progress value={tierProgress} />

            <div className="flex items-center gap-2 text-stone-400">
              <TrendingUp className="h-3.5 w-3.5 text-forest-400" strokeWidth={2} />
              <span className="text-xs">
                <span className="font-bold text-forest-400">{kgNeeded.toLocaleString()} kg</span> more CO₂ offset needed
              </span>
            </div>
          </div>
        )}

        {/* At max tier */}
        {!nextTier && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-forest-600/10 to-forest-700/5 border border-forest-600/30">
            <p className="text-sm text-forest-300 font-medium text-center">
              🏆 Maximum tier achieved!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
