import { Router, type Request, type Response } from "express";
import {
  GreenScoreRequestSchema,
  WalletStateResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { getWalletState } from "../services/walletDataService.js";

export const walletStateRouter = Router();

walletStateRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { wallet } = GreenScoreRequestSchema.parse({
      wallet: req.query.wallet,
    });
    const response = WalletStateResponseSchema.parse(await getWalletState(wallet));
    res.json(response);
  } catch (err) {
    if (isZodLikeError(err)) {
      res.status(400).json({
        error: "Validation error",
        details: getZodLikeDetails(err),
      });
      return;
    }
    console.error("Wallet state error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
