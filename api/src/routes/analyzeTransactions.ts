import { Router, type Request, type Response } from "express";
import {
  AnalyzeTransactionsRequestSchema,
  AnalyzeTransactionsResponseSchema,
} from "@carboniq/contracts";
import { emissionsService } from "../services/emissionsService.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { persistAnalyzedTransactions } from "../services/walletDataService.js";

export const analyzeTransactionsRouter = Router();

analyzeTransactionsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const request = AnalyzeTransactionsRequestSchema.parse(req.body);
    const response = AnalyzeTransactionsResponseSchema.parse(
      emissionsService.analyzeTransactions(request)
    );
    await persistAnalyzedTransactions({
      wallet: request.wallet,
      response,
      plaidAccessToken: request.plaidAccessToken,
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
    console.error("Analyze transactions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
