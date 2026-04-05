import { Router, type Request, type Response } from "express";
import {
  SwapSuggestionsRequestSchema,
  SwapSuggestionsResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { suggestionsService } from "../services/suggestionsService.js";
import { persistRecommendationRun } from "../services/walletDataService.js";

function normalizeCategories(raw: unknown): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const values = Array.isArray(raw) ? raw : [raw];
  const normalized = values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

export const swapSuggestionsRouter = Router();

swapSuggestionsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const request = SwapSuggestionsRequestSchema.parse({
      wallet: req.query.wallet,
      categories: normalizeCategories(req.query.categories),
    });

    const result = await suggestionsService.getSwapSuggestions(request);
    const response = SwapSuggestionsResponseSchema.parse(result.response);
    await persistRecommendationRun({
      request,
      response,
      narratorProvider: result.narratorProvider,
      model: result.model,
      promptHash: result.promptHash,
    });
    res.json(response);
  } catch (err) {
    if (isZodLikeError(err)) {
      res.status(400).json({
        error: "Validation error",
        details: getZodLikeDetails(err),
      });
      return;
    }
    console.error("Swap suggestions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
