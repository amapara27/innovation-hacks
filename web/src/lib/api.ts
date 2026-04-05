export interface AnalyzedTransaction {
  transactionId: string;
  description: string;
  amountUsd: number;
  category: string;
  co2eGrams: number;
  date: string;
}

export interface AnalyzeResponse {
  wallet: string;
  transactionCount: number;
  totalCo2eGrams: number;
  categoryBreakdown?: Record<string, number>;
  transactions: AnalyzedTransaction[];
  analyzedAt?: string;
}

export interface GreenScoreData {
  score: number;
  tier: string;
  breakdown: {
    transactionEfficiency: number;
    spendingHabits: number;
    carbonOffsets: number;
    communityImpact: number;
  };
  rank?: number;
  totalUsers?: number;
}

export interface StakingInfoResponse {
  wallet: string;
  greenScore: number;
  baseApy: number;
  greenBonus: number;
  effectiveApy: number;
  stakedAmount: number;
  accruedYield: number;
  stakeVaultAddress?: string;
}

export type StakeSettlementSource =
  | "vault_onchain"
  | "api_payer_onchain"
  | "demo_accounting";

export interface StakeCollectResponse {
  wallet: string;
  collectedAmount: number;
  remainingAccruedYield: number;
  settlementSource: StakeSettlementSource;
  solanaSignature?: string;
  explorerUrl?: string;
}

export interface StakeWithdrawResponse {
  wallet: string;
  withdrawnAmount: number;
  remainingStakedAmount: number;
  settlementSource: StakeSettlementSource;
  solanaSignature?: string;
  explorerUrl?: string;
}

export interface SimulateStakeTimelineEvent {
  day: number;
  type: "soft_decay_started" | "hard_reset_triggered";
  description: string;
}

export interface SimulateStakeTimelinePoint {
  day: number;
  projectedAccruedYield: number;
  baselineAccruedYield: number;
  multiplier: number;
}

export interface SimulateStakeTimelineResponse {
  horizonDays: number;
  projectedAccruedYield: number;
  baselineAccruedYield: number;
  earningsDelta: number;
  events: SimulateStakeTimelineEvent[];
  points: SimulateStakeTimelinePoint[];
}

export interface SwapSuggestion {
  currentCategory: string;
  currentDescription: string;
  currentCo2eMonthly: number;
  alternativeDescription: string;
  alternativeCo2eMonthly: number;
  co2eSavingsMonthly: number;
  priceDifferenceUsd: number;
  difficulty: "easy" | "moderate" | "hard";
}

export interface SwapSuggestionsResponse {
  wallet: string;
  totalPotentialSavingsMonthly: number;
  suggestions: SwapSuggestion[];
}

export interface WalletStateResponse {
  wallet: string;
  hasUploadedTransactions: boolean;
  latestUploadAt?: string;
  analysis: AnalyzeResponse | null;
  greenScore: GreenScoreData | null;
  stakingInfo: StakingInfoResponse | null;
  latestRecommendations: SwapSuggestionsResponse | null;
  adoptedSuggestionKeys: string[];
}

export interface RecommendationActionResponse {
  wallet: string;
  suggestionKey: string;
  action: "adopted" | "cleared";
  actedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  walletShort: string;
  score: number;
  tier: string;
  totalCo2eOffset: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalEntries: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error. Please try again.";
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // keep fallback message
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function gramsToKg(grams: number): number {
  return grams / 1000;
}

export function formatKg(grams: number, digits = 2): string {
  return `${gramsToKg(grams).toFixed(digits)} kg`;
}

export function buildSuggestionKey(suggestion: SwapSuggestion): string {
  const normalizedParts = [
    suggestion.currentCategory,
    suggestion.currentDescription,
    suggestion.alternativeDescription,
    suggestion.currentCo2eMonthly.toFixed(2),
    suggestion.alternativeCo2eMonthly.toFixed(2),
  ].map((value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );

  return normalizedParts.join("::");
}
