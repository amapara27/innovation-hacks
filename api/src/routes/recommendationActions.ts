import { Router, type Request, type Response } from "express";
import {
  RecommendationActionRequestSchema,
  RecommendationActionResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { persistRecommendationAction } from "../services/walletDataService.js";

export const recommendationActionsRouter = Router();

recommendationActionsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const request = RecommendationActionRequestSchema.parse(req.body);
    const response = RecommendationActionResponseSchema.parse(
      await persistRecommendationAction(request)
    );
    res.json(response);
  } catch (err) {
    if (isZodLikeError(err)) {
      res.status(400).json({
        error: "Validation error",
        details: getZodLikeDetails(err),
      });
      return;
    }

    console.error("Recommendation action error:", err);
    res.status(500).json({
      error:
        err instanceof Error ? err.message : "Failed to persist recommendation action",
    });
  }
});
