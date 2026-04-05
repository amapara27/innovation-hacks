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

type SuggestionNarrativeProvider =
  | "template"
  | "openai_narrator"
  | "openai_recommender";

type SuggestionNarrationResult = SuggestionNarrativeText & {
  provider: SuggestionNarrativeProvider;
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

function readTextCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  if (record.text && typeof record.text === "object") {
    const nestedText = record.text as Record<string, unknown>;
    if (typeof nestedText.value === "string") {
      return nestedText.value;
    }
  }
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  if (record.output_text && typeof record.output_text === "object") {
    const nestedOutputText = record.output_text as Record<string, unknown>;
    if (typeof nestedOutputText.value === "string") {
      return nestedOutputText.value;
    }
  }
  if (typeof record.value === "string") {
    return record.value;
  }
  return null;
}

function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const chunks: string[] = [];
  const root = payload as Record<string, unknown>;
  const topLevel = readTextCandidate(root.output_text);
  if (topLevel) {
    chunks.push(topLevel);
  }

  const output = root.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const itemRecord = item as Record<string, unknown>;
      const directItemText = readTextCandidate(itemRecord);
      if (directItemText) {
        chunks.push(directItemText);
      }

      const content = itemRecord.content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const contentItem of content) {
        const contentText = readTextCandidate(contentItem);
        if (contentText) {
          chunks.push(contentText);
        }
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractFirstJsonObject(value: string): string | null {
  const source = stripMarkdownCodeFences(value);
  const start = source.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseNarrationPayload(payloadText: string): SuggestionNarrativeText {
  const normalizedText = stripMarkdownCodeFences(payloadText);

  const tryParse = (candidate: string): SuggestionNarrativeText | null => {
    const parsed = JSON.parse(candidate) as {
      currentDescription?: unknown;
      alternativeDescription?: unknown;
    };

    if (
      typeof parsed.currentDescription !== "string" ||
      typeof parsed.alternativeDescription !== "string"
    ) {
      return null;
    }

    return {
      currentDescription: normalizeNarrationText(parsed.currentDescription),
      alternativeDescription: normalizeNarrationText(parsed.alternativeDescription),
    };
  };

  try {
    const parsed = tryParse(normalizedText);
    if (parsed) {
      return parsed;
    }
  } catch {
    // Fall through to substring extraction.
  }

  const jsonObject = extractFirstJsonObject(normalizedText);
  if (!jsonObject) {
    const decodeJsonFragment = (fragment: string): string => {
      try {
        return JSON.parse(`"${fragment}"`) as string;
      } catch {
        return fragment.replace(/\\"/g, "\"");
      }
    };
    const currentMatch = normalizedText.match(
      /"currentDescription"\s*:\s*"((?:\\.|[^"\\])*)"/
    );
    const alternativeMatch = normalizedText.match(
      /"alternativeDescription"\s*:\s*"((?:\\.|[^"\\])*)"/
    );
    if (currentMatch?.[1] && alternativeMatch?.[1]) {
      return {
        currentDescription: normalizeNarrationText(
          decodeJsonFragment(currentMatch[1])
        ),
        alternativeDescription: normalizeNarrationText(
          decodeJsonFragment(alternativeMatch[1])
        ),
      };
    }

    throw new Error(
      `Narration payload did not contain a JSON object. Preview: ${normalizedText.slice(
        0,
        220
      )}`
    );
  }

  const parsed = tryParse(jsonObject);
  if (!parsed) {
    throw new Error("Narration payload is missing required string fields");
  }
  return parsed;
}

class OpenAISuggestionNarrator {
  private readonly mode: "recommender" | "narrator" | null;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    const disableInTest =
      process.env.NODE_ENV === "test" && !envFlag("CARBONIQ_FORCE_OPENAI_IN_TEST");
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
    const recommenderEnabled =
      process.env.CARBONIQ_USE_OPENAI_RECOMMENDER === undefined
        ? hasOpenAiKey
        : envFlag("CARBONIQ_USE_OPENAI_RECOMMENDER");
    const narratorEnabled = envFlag("CARBONIQ_USE_OPENAI_NARRATOR");

    if (disableInTest) {
      this.mode = null;
    } else if (recommenderEnabled) {
      this.mode = "recommender";
    } else if (narratorEnabled) {
      this.mode = "narrator";
    } else {
      this.mode = null;
    }

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

  providerLabel(): SuggestionNarrativeProvider | null {
    if (this.mode === "recommender") {
      return "openai_recommender";
    }
    if (this.mode === "narrator") {
      return "openai_narrator";
    }
    return null;
  }

  getModel(): string {
    return this.model;
  }

  isConfigured(): boolean {
    return Boolean(this.mode) && Boolean(this.apiKey);
  }

  private createPrompt(suggestion: SuggestionNarrativeInput): string {
    const sharedContext = [
      `category: ${suggestion.currentCategory}`,
      `seedCurrentDescription: ${suggestion.currentDescription}`,
      `seedAlternativeDescription: ${suggestion.alternativeDescription}`,
      `currentCo2eMonthly: ${suggestion.currentCo2eMonthly}`,
      `alternativeCo2eMonthly: ${suggestion.alternativeCo2eMonthly}`,
      `co2eSavingsMonthly: ${suggestion.co2eSavingsMonthly}`,
      `priceDifferenceUsd: ${suggestion.priceDifferenceUsd}`,
      `difficulty: ${suggestion.difficulty}`,
    ].join("\n");

    if (this.mode === "recommender") {
      return [
        "You generate sustainability product recommendations for a fintech dashboard.",
        "Create NEW recommendation text from category and emissions context (not a copy-edit).",
        "Use practical everyday purchases and include specific lower-emission alternatives.",
        "Keep category meaning and numeric assumptions unchanged.",
        "Do not include raw numeric values in either description.",
        "Each description must be one sentence and under 170 characters.",
        "Tone: concise, plain English, app-ready.",
        "Return strict JSON with keys: currentDescription, alternativeDescription.",
        sharedContext,
      ].join("\n");
    }

    return [
      "You are a sustainability recommendation agent for consumer purchases.",
      "Rewrite the current and alternative descriptions so they are concise and practical.",
      "For the alternative description, include 1-2 concrete everyday lower-emission product or purchase alternatives when appropriate.",
      "Keep category meaning, difficulty, and all numeric values unchanged.",
      "Do not include raw numeric values in either description.",
      "Each description must be one sentence and under 170 characters.",
      "Use plain language suitable for a fintech app.",
      "Return strict JSON with keys: currentDescription, alternativeDescription.",
      sharedContext,
    ].join("\n");
  }

  async narrate(
    suggestion: SuggestionNarrativeInput
  ): Promise<SuggestionNarrativeText> {
    if (!this.isConfigured() || !this.apiKey) {
      throw new Error("OpenAI suggestion narrator is not configured");
    }

    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: this.createPrompt(suggestion),
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "swap_suggestion_narration",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["currentDescription", "alternativeDescription"],
              properties: {
                currentDescription: { type: "string" },
                alternativeDescription: { type: "string" },
              },
            },
          },
        },
        max_output_tokens: Math.max(
          320,
          Number(process.env.CARBONIQ_OPENAI_RECOMMENDER_MAX_OUTPUT_TOKENS ?? 900)
        ),
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
      const record =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : undefined;
      const status =
        typeof record?.status === "string" ? record.status : "unknown_status";
      const incompleteReason =
        record?.incomplete_details &&
        typeof record.incomplete_details === "object" &&
        typeof (record.incomplete_details as Record<string, unknown>).reason ===
          "string"
          ? String(
              (record.incomplete_details as Record<string, unknown>).reason
            )
          : "none";
      throw new Error(
        `OpenAI narrator returned no text output (status=${status}, incomplete_reason=${incompleteReason})`
      );
    }

    return parseNarrationPayload(text);
  }
}

class SuggestionsService {
  private readonly templateNarrator = new TemplateSuggestionNarrator();
  private readonly openAiNarrator = new OpenAISuggestionNarrator();
  private readonly narrationCache = new Map<string, SuggestionNarrationResult>();

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
  ): Promise<SuggestionNarrationResult> {
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

    if (this.openAiNarrator.isConfigured()) {
      try {
        const openAiNarration = await this.openAiNarrator.narrate(suggestion);
        const provider = this.openAiNarrator.providerLabel() ?? "openai_narrator";
        const result: SuggestionNarrationResult = {
          ...openAiNarration,
          provider,
        };
        this.narrationCache.set(cacheKey, result);
        return result;
      } catch (error) {
        console.warn(
          "OpenAI suggestion recommender failed, falling back to template narration:",
          error
        );
      }
    }

    const fallback: SuggestionNarrationResult = {
      ...this.templateNarrator.narrate(suggestion),
      provider: "template",
    };
    this.narrationCache.set(cacheKey, fallback);
    return fallback;
  }

  async getSwapSuggestions(request: SwapSuggestionsRequest): Promise<{
    response: SwapSuggestionsResponse;
    narratorProvider: string;
    model?: string;
    promptHash?: string;
  }> {
    const snapshot = await emissionsService.getCanonicalSnapshot(request.wallet);
    const rankedCategories = this.rankCategories(
      snapshot.categoryEmissionTotals,
      request.categories
    );

    const suggestions: SwapSuggestion[] = [];
    let totalPotentialSavingsMonthly = 0;
    let narratorProvider: SuggestionNarrativeProvider = "template";

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

      if (narration.provider !== "template") {
        narratorProvider = narration.provider;
      }

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

    const model =
      narratorProvider === "template" ? undefined : this.openAiNarrator.getModel();

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
