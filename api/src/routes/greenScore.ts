import { Router, type Request, type Response } from "express";
import {
  GreenScoreRequestSchema,
  GreenScoreResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { refreshStoredGreenScore } from "../services/greenScoreService.js";

export const greenScoreRouter = Router();

greenScoreRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { wallet } = GreenScoreRequestSchema.parse({
      wallet: req.query.wallet,
    });

    const response = GreenScoreResponseSchema.parse(
      await refreshStoredGreenScore(wallet)
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
    console.error("Green score error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
