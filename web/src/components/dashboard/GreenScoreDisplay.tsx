import { Progress } from "@/components/ui/Progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Leaf } from "lucide-react";

interface GreenScoreDisplayProps {
  score: number; // 0–100
  label?: string;
}

export default function GreenScoreDisplay({
  score,
  label = "Your Green Score",
}: GreenScoreDisplayProps) {
  const tier =
    score >= 80
      ? { name: "Platinum", color: "text-forest-300" }
      : score >= 60
        ? { name: "Gold", color: "text-solar-400" }
        : score >= 40
          ? { name: "Silver", color: "text-stone-300" }
          : { name: "Bronze", color: "text-clay-400" };

  return (
    <Card className="relative overflow-hidden">
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
            <Leaf className="h-4 w-4 text-forest-400" strokeWidth={2.5} />
          </div>
          <span className="font-display">{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 relative">
        <div className="flex items-end gap-3">
          <span className="text-6xl font-display font-extrabold gradient-text tabular-nums">
            {score}
          </span>
          <span className="text-base text-stone-500 pb-3 font-medium">/ 100</span>
        </div>

        <Progress value={score} />

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-stone-500 font-medium uppercase tracking-wider">Tier</span>
          <span className={`font-display font-bold text-lg ${tier.color}`}>{tier.name}</span>
        </div>
      </CardContent>
    </Card>
  );
}
