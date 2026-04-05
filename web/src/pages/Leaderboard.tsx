import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { Trophy, Medal, Crown } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  wallet: string;
  score: number;
  co2Offset: number;
}

const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, wallet: "7xKX...m3Qp", score: 98, co2Offset: 12_450 },
  { rank: 2, wallet: "Bq4R...vN8j", score: 95, co2Offset: 11_200 },
  { rank: 3, wallet: "9mPL...kW2s", score: 93, co2Offset: 10_800 },
  { rank: 4, wallet: "Fh6Y...xT9r", score: 89, co2Offset: 9_340 },
  { rank: 5, wallet: "3aVZ...pB7c", score: 87, co2Offset: 8_900 },
  { rank: 6, wallet: "Kn2W...dF4m", score: 84, co2Offset: 8_100 },
  { rank: 7, wallet: "Xt8J...sQ6v", score: 81, co2Offset: 7_650 },
  { rank: 8, wallet: "Lp5R...hG3n", score: 78, co2Offset: 7_200 },
  { rank: 9, wallet: "Dw9M...aK1z", score: 75, co2Offset: 6_800 },
  { rank: 10, wallet: "Yc3T...eJ8b", score: 72, co2Offset: 6_400 },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <Crown className="h-5 w-5 text-solar-400 drop-shadow-lg" />;
  if (rank === 2)
    return <Medal className="h-5 w-5 text-stone-300 drop-shadow-lg" />;
  if (rank === 3)
    return <Medal className="h-5 w-5 text-clay-400 drop-shadow-lg" />;
  return (
    <span className="text-sm font-mono text-stone-500 w-5 text-center">
      {rank}
    </span>
  );
}

export default function Leaderboard() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-stone-50">Leaderboard</h1>
        <p className="text-stone-400 text-base tracking-wide">
          Top sustainability contributors on Solana
        </p>
      </div>

      {/* Top 3 Podium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {mockLeaderboard.slice(0, 3).map((entry, i) => (
          <Card
            key={entry.wallet}
            className={`text-center relative overflow-hidden ${
              i === 0 ? "md:order-2" : i === 1 ? "md:order-1" : "md:order-3"
            }`}
          >
            {i === 0 && (
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-15 blur-3xl bg-gradient-to-br from-solar-400/50 to-solar-600/30"></div>
            )}
            <CardContent className="pt-6 space-y-4 relative">
              <div className="flex justify-center">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full ${
                    i === 0
                      ? "bg-solar-400/10 border-2 border-solar-400/30 shadow-lg shadow-solar-400/20"
                      : i === 1
                        ? "bg-stone-300/10 border-2 border-stone-300/30"
                        : "bg-clay-400/10 border-2 border-clay-400/30"
                  }`}
                >
                  <RankBadge rank={entry.rank} />
                </div>
              </div>
              <p className="font-mono text-sm text-stone-400">{entry.wallet}</p>
              <p className="text-4xl font-display font-extrabold gradient-text">{entry.score}</p>
              <p className="text-xs text-stone-500 font-medium">
                {entry.co2Offset.toLocaleString()} kg CO₂ offset
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-solar-600/20 to-solar-700/15 border border-solar-600/20">
              <Trophy className="h-4 w-4 text-solar-400" strokeWidth={2.5} />
            </div>
            <span className="font-display">Full Rankings</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {mockLeaderboard.map((entry) => (
              <div
                key={entry.wallet}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-900/40 transition-all duration-300 border border-transparent hover:border-stone-800/60"
              >
                <RankBadge rank={entry.rank} />
                <p className="font-mono text-sm flex-1 text-stone-400">{entry.wallet}</p>
                <div className="w-32 hidden sm:block">
                  <Progress value={entry.score} />
                </div>
                <p className="font-semibold text-forest-400 w-12 text-right">
                  {entry.score}
                </p>
                <p className="text-xs text-stone-500 w-28 text-right">
                  {entry.co2Offset.toLocaleString()} kg
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
