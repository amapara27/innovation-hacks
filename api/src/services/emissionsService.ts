import {
  AnalyzeTransactionsRequestSchema,
  DEFAULT_TRANSACTION_LIMIT,
  type AnalyzeTransactionsRequest,
  type AnalyzeTransactionsResponse,
  type AnalyzedTransaction,
} from "@carboniq/contracts";
import {
  CATEGORY_ORDER,
  EMISSION_FACTORS,
  KEYWORD_CATEGORY_MAP,
  MCC_CATEGORY_MAP,
  REFERENCE_ANALYZED_AT,
  type AnalysisSnapshot,
  type EmissionCategoryValue,
  type RawTransaction,
} from "../lib/aiRules.js";
import { roundTo } from "../lib/aiMath.js";
import { spendEmissionsProvider } from "./spendEmissionsProvider.js";
import { transactionProvider } from "./transactionProviderService.js";

function emptyCategoryTotals(): Record<EmissionCategoryValue, number> {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as Record<
    EmissionCategoryValue,
    number
  >;
}

class EmissionsService {
  private readonly analysisCache = new Map<string, AnalyzeTransactionsResponse>();

  private getCacheKey(wallet: string, limit: number, plaidAccessToken?: string) {
    return `${wallet}:${limit}:${plaidAccessToken ?? ""}`;
  }

  classifyTransaction(rawTransaction: RawTransaction): EmissionCategoryValue {
    if (rawTransaction.mccCode && MCC_CATEGORY_MAP[rawTransaction.mccCode]) {
      return MCC_CATEGORY_MAP[rawTransaction.mccCode];
    }

    const lowered = rawTransaction.description.toLowerCase();
    for (const [keywords, category] of KEYWORD_CATEGORY_MAP) {
      if (keywords.some((keyword) => lowered.includes(keyword))) {
        return category;
      }
    }

    return "other";
  }

  private async buildSnapshot(
    wallet: string,
    limit: number,
    plaidAccessToken?: string
  ): Promise<
    AnalysisSnapshot & {
      source: "upload" | "seeded";
      sourceLabel?: string;
    }
  > {
    const ledger = await transactionProvider.getTransactions(wallet, plaidAccessToken);
    const selected = ledger.transactions.slice(0, limit);

    const categoryBreakdown = emptyCategoryTotals();
    const categorySpend = emptyCategoryTotals();
    const transactions: AnalyzedTransaction[] = [];
    let totalSpendUsd = 0;
    let totalCo2eGrams = 0;

    for (const rawTransaction of selected) {
      const category = this.classifyTransaction(rawTransaction);
      const providerEstimate = await spendEmissionsProvider.estimate(rawTransaction);
      const emissionFactor =
        providerEstimate?.emissionFactor ?? EMISSION_FACTORS[category];
      const co2eGrams =
        providerEstimate?.co2eGrams ??
        roundTo(rawTransaction.amountUsd * emissionFactor, 2);

      transactions.push({
        transactionId: rawTransaction.transactionId,
        description: rawTransaction.description,
        amountUsd: rawTransaction.amountUsd,
        mccCode: rawTransaction.mccCode,
        category,
        co2eGrams,
        emissionFactor: roundTo(emissionFactor, 2),
        date: rawTransaction.date,
      });

      totalSpendUsd = roundTo(totalSpendUsd + rawTransaction.amountUsd, 2);
      totalCo2eGrams = roundTo(totalCo2eGrams + co2eGrams, 2);
      categorySpend[category] = roundTo(
        categorySpend[category] + rawTransaction.amountUsd,
        2
      );
      categoryBreakdown[category] = roundTo(
        categoryBreakdown[category] + co2eGrams,
        2
      );
    }

    const response = {
      wallet,
      transactionCount: transactions.length,
      totalCo2eGrams,
      categoryBreakdown,
      transactions,
      analyzedAt: REFERENCE_ANALYZED_AT,
    } satisfies AnalyzeTransactionsResponse;

    return {
      response,
      totalSpendUsd,
      totalCo2eGrams,
      categorySpendTotals: categorySpend,
      categoryEmissionTotals: categoryBreakdown,
      source: ledger.source,
      sourceLabel: ledger.sourceLabel,
    };
  }

  async analyzeTransactions(
    rawRequest: AnalyzeTransactionsRequest
  ): Promise<AnalyzeTransactionsResponse> {
    const request = AnalyzeTransactionsRequestSchema.parse(rawRequest);
    const cacheKey = this.getCacheKey(
      request.wallet,
      request.limit,
      request.plaidAccessToken
    );
    const cached = this.analysisCache.get(cacheKey);
    if (cached) {
      return structuredClone(cached);
    }

    const snapshot = await this.buildSnapshot(
      request.wallet,
      request.limit,
      request.plaidAccessToken
    );
    this.analysisCache.set(cacheKey, snapshot.response);
    return structuredClone(snapshot.response);
  }

  async getCanonicalSnapshot(wallet: string): Promise<AnalysisSnapshot> {
    const snapshot = await this.buildSnapshot(wallet, DEFAULT_TRANSACTION_LIMIT);
    return {
      response: snapshot.response,
      totalSpendUsd: snapshot.totalSpendUsd,
      totalCo2eGrams: snapshot.totalCo2eGrams,
      categorySpendTotals: snapshot.categorySpendTotals,
      categoryEmissionTotals: snapshot.categoryEmissionTotals,
    };
  }

  clearWalletCache(wallet: string): void {
    for (const cacheKey of this.analysisCache.keys()) {
      if (cacheKey.startsWith(`${wallet}:`)) {
        this.analysisCache.delete(cacheKey);
      }
    }
  }
}

export const emissionsService = new EmissionsService();
