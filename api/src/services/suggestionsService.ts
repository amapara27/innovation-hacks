import { createHash } from "node:crypto";
import {
  SWAP_SUGGESTIONS_COUNT,
  type SwapSuggestionsResponse,
  type SwapSuggestion,
  type SwapSuggestionsRequest,
} from "@carboniq/contracts";
import {
  CATEGORY_ORDER,
  CATEGORY_ORDER_INDEX,
  SUGGESTION_RULES,
  type EmissionCategoryValue,
} from "../lib/aiRules.js";
import { roundTo } from "../lib/aiMath.js";
import { emissionsService } from "./emissionsService.js";

type SuggestionNarrativeInput = {
  currentCategory: EmissionCategoryValue;
  currentDescription: string;
  alternativeDescription: string;
  currentCo2eMonthly: number;
  alternativeCo2eMonthly: number;
  co2eSavingsMonthly: number;
  priceDifferenceUsd: number;
  difficulty: SwapSuggestion["difficulty"];
};

type SuggestionNarrativeText = {
  currentDescription: string;
  alternativeDescription: string;
};

class TemplateSuggestionNarrator {
  narrate(suggestion: SuggestionNarrativeInput): SuggestionNarrativeText {
    return {
      currentDescription: suggestion.currentDescription,
      alternativeDescription: suggestion.alternativeDescription,
    };
  }
}

class SuggestionsService {
  private readonly narrator = new TemplateSuggestionNarrator();
  private readonly narrationCache = new Map<string, SuggestionNarrativeText>();

  private rankCategories(
    categoryTotals: Record<EmissionCategoryValue, number>,
    requestedCategories?: EmissionCategoryValue[]
  ): EmissionCategoryValue[] {
    const requested = requestedCategories?.length
      ? requestedCategories
      : CATEGORY_ORDER;
    const ranked = [...requested].sort(
      (left, right) =>
        categoryTotals[right] - categoryTotals[left] ||
        CATEGORY_ORDER_INDEX[left] - CATEGORY_ORDER_INDEX[right]
    );

    if (ranked.length >= SWAP_SUGGESTIONS_COUNT.min) {
      return ranked.slice(0, SWAP_SUGGESTIONS_COUNT.max);
    }

    const seen = new Set(ranked);
    const backfill = [...CATEGORY_ORDER]
      .sort(
        (left, right) =>
          categoryTotals[right] - categoryTotals[left] ||
          CATEGORY_ORDER_INDEX[left] - CATEGORY_ORDER_INDEX[right]
      )
      .filter((category) => !seen.has(category));

    return [...ranked, ...backfill].slice(0, SWAP_SUGGESTIONS_COUNT.max);
  }

  private narrate(
    wallet: string,
    suggestion: SuggestionNarrativeInput
  ): SuggestionNarrativeText {
    const cacheKey = createHash("sha256")
      .update(
        [
          wallet,
          suggestion.currentCategory,
          suggestion.currentCo2eMonthly,
          suggestion.alternativeCo2eMonthly,
          suggestion.co2eSavingsMonthly,
          suggestion.priceDifferenceUsd,
          suggestion.difficulty,
        ].join("|")
      )
      .digest("hex");
    const cached = this.narrationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const narration = this.narrator.narrate(suggestion);
    this.narrationCache.set(cacheKey, narration);
    return narration;
  }

  getSwapSuggestions(
    request: SwapSuggestionsRequest
  ): SwapSuggestionsResponse {
    const snapshot = emissionsService.getCanonicalSnapshot(request.wallet);
    const rankedCategories = this.rankCategories(
      snapshot.categoryEmissionTotals,
      request.categories
    );

    const suggestions: SwapSuggestion[] = [];
    let totalPotentialSavingsMonthly = 0;

    for (const category of rankedCategories) {
      const rule = SUGGESTION_RULES[category];
      const currentCo2eMonthly = snapshot.categoryEmissionTotals[category];
      const alternativeCo2eMonthly = roundTo(
        currentCo2eMonthly * rule.alternativeShare,
        2
      );
      const co2eSavingsMonthly = roundTo(
        currentCo2eMonthly - alternativeCo2eMonthly,
        2
      );
      const narration = this.narrate(request.wallet, {
        currentCategory: category,
        currentDescription: rule.currentDescription,
        alternativeDescription: rule.alternativeDescription,
        currentCo2eMonthly,
        alternativeCo2eMonthly,
        co2eSavingsMonthly,
        priceDifferenceUsd: rule.priceDifferenceUsd,
        difficulty: rule.difficulty,
      });

      suggestions.push({
        currentCategory: category,
        currentDescription: narration.currentDescription,
        currentCo2eMonthly,
        alternativeDescription: narration.alternativeDescription,
        alternativeCo2eMonthly,
        co2eSavingsMonthly,
        priceDifferenceUsd: roundTo(rule.priceDifferenceUsd, 2),
        difficulty: rule.difficulty,
      });
      totalPotentialSavingsMonthly = roundTo(
        totalPotentialSavingsMonthly + co2eSavingsMonthly,
        2
      );
    }

    return {
      wallet: request.wallet,
      suggestions,
      totalPotentialSavingsMonthly,
    };
  }
}

export const suggestionsService = new SuggestionsService();
