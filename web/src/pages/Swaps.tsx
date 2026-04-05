import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, Leaf, RefreshCw, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWalletState } from "@/hooks/useWalletState";
import {
  buildSuggestionKey,
  formatError,
  formatKg,
  requestJson,
  type RecommendationActionResponse,
  type SwapSuggestion,
  type SwapSuggestionsResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function LoadingSuggestions() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-forest-700/25 bg-forest-700/8 p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-forest-300/80">
          Product Alternative Engine
        </p>
        <div className="mt-3 space-y-2 text-sm text-stone-400">
          <p className="animate-pulse">Scanning your latest purchases...</p>
          <p className="animate-pulse [animation-delay:150ms]">
            Comparing lower-carbon alternatives...
          </p>
          <p className="animate-pulse [animation-delay:300ms]">
            Ranking swaps by impact, cost, and effort...
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="p-5 border-stone-800/80">
            <div className="space-y-4 animate-pulse">
              <div className="flex items-center justify-between gap-3">
                <div className="h-3 w-24 rounded bg-stone-800" />
                <div className="h-6 w-16 rounded-full bg-stone-800" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-28 rounded bg-stone-900" />
                <div className="h-10 w-32 rounded bg-stone-800" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-stone-900" />
                <div className="h-4 w-5/6 rounded bg-stone-900" />
                <div className="h-4 w-4/5 rounded bg-forest-900/30" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Swaps() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const {
    data: walletState,
    isLoading: isHydratingState,
    error: walletStateError,
    refetch: refetchWalletState,
  } = useWalletState(wallet);

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SwapSuggestionsResponse | null>(null);
  const [adopted, setAdopted] = useState<Record<string, boolean>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    setResult(walletState?.latestRecommendations ?? null);
    setAdopted(
      Object.fromEntries(
        (walletState?.adoptedSuggestionKeys ?? []).map((suggestionKey) => [
          suggestionKey,
          true,
        ])
      )
    );
  }, [walletState]);

  useEffect(() => {
    if (!wallet) {
      setResult(null);
      setAdopted({});
      setSelectedIndex(null);
      setError("");
    }
  }, [wallet]);

  useEffect(() => {
    if (selectedIndex === null) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIndex(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedIndex]);

  const selectedSuggestion =
    result && selectedIndex !== null ? result.suggestions[selectedIndex] : null;
  const selectedSuggestionKey = selectedSuggestion
    ? buildSuggestionKey(selectedSuggestion)
    : null;
  const showLoadingState = (isHydratingState || isLoading) && !result;

  async function loadSuggestions() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await requestJson<SwapSuggestionsResponse>(
        `/api/swap-suggestions?wallet=${encodeURIComponent(wallet)}`
      );
      setResult(response);
      setSelectedIndex(null);
      await refetchWalletState();
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRecommendationAction(suggestion: SwapSuggestion) {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    const suggestionKey = buildSuggestionKey(suggestion);
    const nextAction = adopted[suggestionKey] ? "cleared" : "adopted";

    setError("");
    setIsSavingAction(true);

    try {
      await requestJson<RecommendationActionResponse>("/api/recommendation-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          suggestionKey,
          action: nextAction,
        }),
      });

      setAdopted((previous) => ({
        ...previous,
        [suggestionKey]: nextAction === "adopted",
      }));
      await refetchWalletState();
    } catch (actionError) {
      setError(formatError(actionError));
    } finally {
      setIsSavingAction(false);
    }
  }

  function getDifficultyClasses(difficulty: "easy" | "moderate" | "hard"): string {
    if (difficulty === "easy") {
      return "text-forest-300 bg-forest-700/15 border-forest-600/30";
    }
    if (difficulty === "moderate") {
      return "text-earth-300 bg-earth-700/15 border-earth-600/30";
    }
    return "text-clay-300 bg-clay-700/15 border-clay-600/30";
  }

  const adoptedCount = useMemo(
    () => Object.values(adopted).filter(Boolean).length,
    [adopted]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Product Swaps</h1>
        <p className="text-gray-400 mt-1">
          LLM-generated lower-emission alternatives based on your uploaded spending history.
        </p>
      </div>

      {!wallet && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Wallet to View Recommendations</CardTitle>
            <CardDescription>
              Your wallet unlocks saved product alternatives and adoption state.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-forest-400" />
            Swap Suggestions
          </CardTitle>
          <CardDescription>
            Recommendations persist per wallet and restore automatically after reload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={loadSuggestions} disabled={isLoading || !wallet}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              {isLoading ? "Refreshing..." : result ? "Refresh Suggestions" : "Generate Suggestions"}
            </Button>

            {result && (
              <p className="text-sm text-stone-300">
                Total potential savings:{" "}
                <span className="text-forest-300">
                  {formatKg(result.totalPotentialSavingsMonthly)}/month
                </span>
              </p>
            )}

            {adoptedCount > 0 && (
              <p className="text-sm text-stone-500">
                {adoptedCount} saved swap{adoptedCount === 1 ? "" : "s"} adopted
              </p>
            )}
          </div>

          {walletStateError && !result && (
            <p className="text-sm text-clay-400">{walletStateError}</p>
          )}
          {error && <p className="text-sm text-clay-400">{error}</p>}
        </CardContent>
      </Card>

      {showLoadingState && <LoadingSuggestions />}

      {!showLoadingState && result && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {result.suggestions.map((suggestion, index) => {
            const suggestionKey = buildSuggestionKey(suggestion);

            return (
              <Card
                key={suggestionKey}
                className={cn(
                  "p-5 text-left transition-all duration-300",
                  "hover:translate-y-[-2px]",
                  selectedIndex === index
                    ? "border-forest-500/50 shadow-[0_0_0_1px_rgba(107,155,107,0.35),0_12px_30px_-12px_rgba(107,155,107,0.45)]"
                    : "border-stone-800/80"
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className="w-full text-left"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-stone-400 uppercase tracking-wider">
                        {suggestion.currentCategory}
                      </p>
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider border",
                          getDifficultyClasses(suggestion.difficulty)
                        )}
                      >
                        {suggestion.difficulty}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs text-stone-500 uppercase tracking-wider">
                        Monthly CO₂ Savings
                      </p>
                      <p className="text-3xl font-display font-bold gradient-text tracking-tight">
                        {formatKg(suggestion.co2eSavingsMonthly, 2)}
                      </p>
                    </div>

                    <div className="text-sm text-stone-300 space-y-2">
                      <p className="line-clamp-2">
                        <span className="text-stone-500">Current:</span>{" "}
                        {suggestion.currentDescription}
                      </p>
                      <p className="line-clamp-2 text-forest-300">
                        <span className="text-stone-500">Swap to:</span>{" "}
                        {suggestion.alternativeDescription}
                      </p>
                    </div>

                    <div className="pt-1 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                        <Sparkles className="h-3.5 w-3.5 text-forest-400" />
                        Click for details
                      </span>

                      {adopted[suggestionKey] && (
                        <span className="text-[11px] uppercase tracking-[0.2em] text-forest-300">
                          Adopted
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      {!showLoadingState && wallet && !result && !walletStateError && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-stone-300">No saved recommendations yet.</p>
            <p className="text-sm text-stone-500">
              Generate suggestions to compare lower-carbon alternatives for your recent spending.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedSuggestion && selectedIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-surface-950/80 backdrop-blur-sm"
            onClick={() => setSelectedIndex(null)}
            aria-label="Close swap details"
          />

          <Card
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-y-auto border-forest-600/35"
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Leaf className="h-5 w-5 text-forest-400" />
                    Swap Details
                  </CardTitle>
                  <CardDescription>
                    {selectedSuggestion.currentCategory} • Estimated savings{" "}
                    <span className="text-forest-300">
                      {formatKg(selectedSuggestion.co2eSavingsMonthly)}/month
                    </span>
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedIndex(null)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-stone-800 bg-surface-900/40 p-4 space-y-2">
                  <p className="text-xs text-stone-500 uppercase tracking-wider">Current Product</p>
                  <p className="text-stone-200 text-sm leading-relaxed">
                    {selectedSuggestion.currentDescription}
                  </p>
                  <p className="text-xs text-clay-300">
                    {formatKg(selectedSuggestion.currentCo2eMonthly)}/month
                  </p>
                </div>

                <div className="rounded-xl border border-forest-700/40 bg-forest-700/10 p-4 space-y-2">
                  <p className="text-xs text-stone-500 uppercase tracking-wider">
                    Suggested Alternative
                  </p>
                  <p className="text-forest-200 text-sm leading-relaxed">
                    {selectedSuggestion.alternativeDescription}
                  </p>
                  <p className="text-xs text-forest-300">
                    {formatKg(selectedSuggestion.alternativeCo2eMonthly)}/month
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-stone-800 bg-surface-900/40 p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="text-stone-400">Emission Reduction:</span>
                  <span className="font-display text-lg text-forest-300">
                    {formatKg(selectedSuggestion.co2eSavingsMonthly)}/month
                  </span>
                  <ArrowRight className="h-4 w-4 text-stone-600" />
                  <span
                    className={
                      selectedSuggestion.priceDifferenceUsd <= 0
                        ? "text-forest-300"
                        : "text-earth-300"
                    }
                  >
                    {selectedSuggestion.priceDifferenceUsd <= 0
                      ? `~$${Math.abs(selectedSuggestion.priceDifferenceUsd).toFixed(2)} cheaper`
                      : `~$${selectedSuggestion.priceDifferenceUsd.toFixed(2)} more`}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  variant={selectedSuggestionKey && adopted[selectedSuggestionKey] ? "secondary" : "default"}
                  onClick={() => void handleRecommendationAction(selectedSuggestion)}
                  disabled={isSavingAction}
                >
                  {selectedSuggestionKey && adopted[selectedSuggestionKey]
                    ? "Clear Adopted"
                    : "Mark Adopted"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
