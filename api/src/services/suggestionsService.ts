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

function normalizeNarrationText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function stripMarkdownCodeFences(value: string): string {
  const fenced = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? value.trim();
}

function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const maybeMessage = item as { type?: unknown; content?: unknown };
    if (maybeMessage.type !== "message" || !Array.isArray(maybeMessage.content)) {
      continue;
    }

    for (const contentItem of maybeMessage.content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const maybeText = contentItem as { type?: unknown; text?: unknown };
      if (
        (maybeText.type === "output_text" || maybeText.type === "text") &&
        typeof maybeText.text === "string"
      ) {
        chunks.push(maybeText.text);
      }
    }
  }

  return chunks.join("").trim();
}

function parseNarrationPayload(payloadText: string): SuggestionNarrativeText {
  const parsed = JSON.parse(stripMarkdownCodeFences(payloadText)) as {
    currentDescription?: unknown;
    alternativeDescription?: unknown;
  };

  if (
    typeof parsed.currentDescription !== "string" ||
    typeof parsed.alternativeDescription !== "string"
  ) {
    throw new Error("Narration payload is missing required string fields");
  }

  return {
    currentDescription: normalizeNarrationText(parsed.currentDescription),
    alternativeDescription: normalizeNarrationText(parsed.alternativeDescription),
  };
}

class OpenAISuggestionNarrator {
  private readonly useOpenAi: boolean;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    this.useOpenAi =
      envFlag("CARBONIQ_USE_OPENAI_RECOMMENDER") ||
      envFlag("CARBONIQ_USE_OPENAI_NARRATOR");
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    this.model = process.env.CARBONIQ_OPENAI_MODEL || "gpt-5-mini";
    this.timeoutMs = Math.max(
      1_000,
      Math.round(
        Number(process.env.CARBONIQ_HTTP_TIMEOUT_SECONDS || "10") * 1_000
      ) || 10_000
    );
  }

  isConfigured(): boolean {
    return this.useOpenAi && Boolean(this.apiKey);
  }

  async narrate(
    suggestion: SuggestionNarrativeInput
  ): Promise<SuggestionNarrativeText> {
    if (!this.isConfigured() || !this.apiKey) {
      throw new Error("OpenAI suggestion narrator is not configured");
    }

    const prompt = [
      "You are a sustainability recommendation agent for consumer purchases.",
      "Rewrite the current and alternative descriptions so they are concise and practical.",
      "For the alternative description, include 1-2 concrete everyday lower-emission product or purchase alternatives when appropriate.",
      "Keep category meaning, difficulty, and all numeric values unchanged.",
      "Use plain language suitable for a fintech app.",
      "Return strict JSON with keys: currentDescription, alternativeDescription.",
      `category: ${suggestion.currentCategory}`,
      `currentDescription: ${suggestion.currentDescription}`,
      `alternativeDescription: ${suggestion.alternativeDescription}`,
      `currentCo2eMonthly: ${suggestion.currentCo2eMonthly}`,
      `alternativeCo2eMonthly: ${suggestion.alternativeCo2eMonthly}`,
      `co2eSavingsMonthly: ${suggestion.co2eSavingsMonthly}`,
      `priceDifferenceUsd: ${suggestion.priceDifferenceUsd}`,
      `difficulty: ${suggestion.difficulty}`,
    ].join("\n");

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: prompt,
        max_output_tokens: 220,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenAI narrator request failed (${response.status}): ${body.slice(0, 300)}`
      );
    }

    const payload = (await response.json()) as unknown;
    const text = extractResponsesText(payload);
    if (!text) {
      throw new Error("OpenAI narrator returned no text output");
    }

    return parseNarrationPayload(text);
  }
}

class SuggestionsService {
  private readonly templateNarrator = new TemplateSuggestionNarrator();
  private readonly openAiNarrator = new OpenAISuggestionNarrator();
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

  private async narrate(
    wallet: string,
    suggestion: SuggestionNarrativeInput
  ): Promise<SuggestionNarrativeText> {
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

    let narration = this.templateNarrator.narrate(suggestion);
    if (this.openAiNarrator.isConfigured()) {
      try {
        narration = await this.openAiNarrator.narrate(suggestion);
      } catch (error) {
        console.warn(
          "OpenAI suggestion narrator failed, falling back to template narration:",
          error
        );
      }
    }
    this.narrationCache.set(cacheKey, narration);
    return narration;
  }

  async getSwapSuggestions(request: SwapSuggestionsRequest): Promise<{
    response: SwapSuggestionsResponse;
    narratorProvider: string;
    model?: string;
    promptHash?: string;
  }> {
    const snapshot = emissionsService.getCanonicalSnapshot(request.wallet);
    const rankedCategories = this.rankCategories(
      snapshot.categoryEmissionTotals,
      request.categories
    );

    const suggestions: SwapSuggestion[] = [];
    let totalPotentialSavingsMonthly = 0;
    const narratorProvider = this.openAiNarrator.isConfigured()
      ? "openai"
      : "template";
    const model = this.openAiNarrator.isConfigured()
      ? process.env.CARBONIQ_OPENAI_MODEL || "gpt-5-mini"
      : undefined;
    const promptHash = createHash("sha256")
      .update(
        JSON.stringify({
          wallet: request.wallet,
          categories: request.categories ?? [],
          categoryTotals: snapshot.categoryEmissionTotals,
        })
      )
      .digest("hex");

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
      const narration = await this.narrate(request.wallet, {
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
      response: {
        wallet: request.wallet,
        suggestions,
        totalPotentialSavingsMonthly,
      },
      narratorProvider,
      model,
      promptHash,
    };
  }
}

export const suggestionsService = new SuggestionsService();
