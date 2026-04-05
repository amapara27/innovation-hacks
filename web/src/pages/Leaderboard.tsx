import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Progress } from "@/components/ui/Progress";
import { formatError, requestJson, type LeaderboardResponse } from "@/lib/api";

export default function Leaderboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await requestJson<LeaderboardResponse>(
          "/api/leaderboard?page=1&pageSize=25"
        );

        if (!cancelled) {
          setData(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(formatError(loadError));
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-4xl font-display font-bold tracking-tight text-stone-50">
          Leaderboard
        </h1>
        <p className="text-stone-400 text-base tracking-wide">
          Live rankings based on stored green scores, with a full field always visible.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <Trophy className="h-4 w-4 text-solar-400" strokeWidth={2.5} />
            Full Rankings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-clay-400">{error}</p>}

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 10 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 rounded-lg border border-stone-900 animate-pulse"
                >
                  <div className="h-4 w-5 rounded bg-stone-800" />
                  <div className="h-4 flex-1 rounded bg-stone-900" />
                  <div className="hidden sm:block h-2 w-32 rounded bg-stone-900" />
                  <div className="h-4 w-12 rounded bg-stone-800" />
                  <div className="h-4 w-20 rounded bg-stone-900" />
                </div>
              ))}
            </div>
          )}

          {data && (
            <>
              <p className="text-xs text-stone-500">
                Showing {data.entries.length} of {data.totalEntries} entries
              </p>
              <div className="space-y-2">
                {data.entries.map((entry) => (
                  <div
                    key={entry.wallet}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-surface-900/40 transition-all duration-300 border border-transparent hover:border-stone-800/60"
                  >
                    <span className="text-sm font-mono text-stone-500 w-5 text-center">
                      {entry.rank}
                    </span>
                    <p className="font-mono text-sm flex-1 text-stone-400">
                      {entry.walletShort}
                    </p>
                    <div className="w-32 hidden sm:block">
                      <Progress value={entry.score} />
                    </div>
                    <p className="font-semibold text-forest-400 w-12 text-right">
                      {entry.score}
                    </p>
                    <p className="text-xs text-stone-500 w-28 text-right">
                      {(entry.totalCo2eOffset / 1000).toFixed(2)} kg
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
