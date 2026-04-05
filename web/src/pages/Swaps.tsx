import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Leaf, RefreshCw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwapSuggestionsResponse {
  wallet: string;
  totalPotentialSavingsMonthly: number;
  suggestions: Array<{
    currentCategory: string;
    currentDescription: string;
    currentCo2eMonthly: number;
    alternativeDescription: string;
    alternativeCo2eMonthly: number;
    co2eSavingsMonthly: number;
    priceDifferenceUsd: number;
    difficulty: "easy" | "moderate" | "hard";
  }>;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

export default function Swaps() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SwapSuggestionsResponse | null>(null);
  const [adopted, setAdopted] = useState<Record<number, boolean>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selectedSuggestion =
    result && selectedIndex !== null ? result.suggestions[selectedIndex] : null;

  async function loadSuggestions() {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/swap-suggestions?wallet=${wallet}`);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const json = (await response.json()) as SwapSuggestionsResponse;
      setResult(json);
      setAdopted({});
      setSelectedIndex(null);
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setIsLoading(false);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Product Swaps</h1>
        <p className="text-gray-400 mt-1">
          AI suggests lower-emission alternatives you can adopt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-forest-400" />
            Swap Suggestions
          </CardTitle>
          <CardDescription>
            This is product recommendation mode, not token DEX execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loadSuggestions} disabled={isLoading}>
            <RefreshCw className="h-4 w-4" />
            {isLoading ? "Loading..." : "Load Suggestions"}
          </Button>
          {error && <p className="text-sm text-clay-400">{error}</p>}
          {result && (
            <p className="text-sm text-stone-300">
              Total potential savings:{" "}
              <span className="text-forest-300">
                {result.totalPotentialSavingsMonthly.toFixed(2)} g CO₂/month
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {result.suggestions.map((suggestion, index) => (
            <Card
              key={`${suggestion.currentCategory}-${index}`}
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
                    <p className="text-xs text-stone-500 uppercase tracking-wider">Monthly CO₂ Savings</p>
                    <p className="text-3xl font-display font-bold gradient-text tracking-tight">
                      {suggestion.co2eSavingsMonthly.toFixed(0)}g
                    </p>
                  </div>

                  <div className="text-sm text-stone-300 space-y-2">
                    <p className="line-clamp-2">
                      <span className="text-stone-500">Current:</span> {suggestion.currentDescription}
                    </p>
                    <p className="line-clamp-2 text-forest-300">
                      <span className="text-stone-500">Swap to:</span>{" "}
                      {suggestion.alternativeDescription}
                    </p>
                  </div>

                  <div className="pt-1">
                    <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                      <Sparkles className="h-3.5 w-3.5 text-forest-400" />
                      Click for details
                    </span>
                  </div>
                </div>
              </button>
            </Card>
          ))}
        </div>
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
                      {selectedSuggestion.co2eSavingsMonthly.toFixed(2)} g CO₂/month
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
                    {selectedSuggestion.currentCo2eMonthly.toFixed(2)} g CO₂/month
                  </p>
                </div>

                <div className="rounded-xl border border-forest-700/40 bg-forest-700/10 p-4 space-y-2">
                  <p className="text-xs text-stone-500 uppercase tracking-wider">Suggested Alternative</p>
                  <p className="text-forest-200 text-sm leading-relaxed">
                    {selectedSuggestion.alternativeDescription}
                  </p>
                  <p className="text-xs text-forest-300">
                    {selectedSuggestion.alternativeCo2eMonthly.toFixed(2)} g CO₂/month
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-stone-800 bg-surface-900/40 p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                  <span className="text-stone-400">Emission Reduction:</span>
                  <span className="font-display text-lg text-forest-300">
                    {selectedSuggestion.co2eSavingsMonthly.toFixed(2)} g/month
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
                  variant={adopted[selectedIndex] ? "secondary" : "default"}
                  onClick={() =>
                    setAdopted((prev) => ({ ...prev, [selectedIndex]: !prev[selectedIndex] }))
                  }
                >
                  {adopted[selectedIndex] ? "Adopted" : "Mark Adopted"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {result && (
        <Card>
          <CardContent className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={loadSuggestions}
              disabled={isLoading}
            >
              Refresh Suggestions
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
