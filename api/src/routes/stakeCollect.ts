import { Router, type Request, type Response } from "express";
import {
  StakeCollectRequestSchema,
  StakeCollectResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import {
  collectStakeYield,
  defaultStakePayoutDeps,
  type StakePayoutDeps,
} from "../services/stakePayoutService.js";

function isBusinessRuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /No accrued yield available to collect/i.test(error.message);
}

export function createStakeCollectRouter(
  deps: StakePayoutDeps = defaultStakePayoutDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = StakeCollectRequestSchema.parse(req.body);
      const response = StakeCollectResponseSchema.parse(
        await collectStakeYield(request, deps)
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

      if (isBusinessRuleError(err)) {
        res.status(422).json({ error: err instanceof Error ? err.message : "Invalid request" });
        return;
      }

      console.error("Stake collect error:", err);
      res.status(500).json({
        error: "Failed to collect stake yield",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
}

export const stakeCollectRouter = createStakeCollectRouter();
