import { Router, type Request, type Response } from "express";
import {
  DemoConnectBankRequestSchema,
  DemoConnectBankResponseSchema,
  DEFAULT_TRANSACTION_LIMIT,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { demoBankLedgerService } from "../services/demoBankLedgerService.js";
import { emissionsService } from "../services/emissionsService.js";
import {
  markLatestUpload,
  persistAnalyzedTransactions,
} from "../services/walletDataService.js";
import { refreshStoredGreenScore } from "../services/greenScoreService.js";

export const demoConnectBankRouter = Router();

demoConnectBankRouter.post("/", async (req: Request, res: Response) => {
  try {
    const request = DemoConnectBankRequestSchema.parse(req.body);
    const connectedAt = new Date().toISOString();
    const internalSourceLabel =
      request.mode === "preset"
        ? `preset:${request.scenario}:${connectedAt}`
        : `upload:${connectedAt}`;

    const connectedTransactions =
      request.mode === "preset"
        ? demoBankLedgerService.connectPreset(request.wallet, request.scenario!)
        : demoBankLedgerService.connectUpload(request.wallet, request.transactions!);

    emissionsService.clearWalletCache(request.wallet);
    const analysis = await emissionsService.analyzeTransactions({
      wallet: request.wallet,
      limit: DEFAULT_TRANSACTION_LIMIT,
    });
    await persistAnalyzedTransactions({
      wallet: request.wallet,
      response: analysis,
      sourceLabel: internalSourceLabel,
    });
    if (request.mode === "upload") {
      await markLatestUpload(request.wallet, connectedAt, internalSourceLabel);
    }
    await refreshStoredGreenScore(request.wallet);

    const response = DemoConnectBankResponseSchema.parse({
      wallet: request.wallet,
      mode: request.mode,
      sourceLabel:
        request.mode === "preset" ? `preset:${request.scenario}` : "upload",
      transactionCount: connectedTransactions.length,
      connectedAt,
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

    console.error("Demo connect bank error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
