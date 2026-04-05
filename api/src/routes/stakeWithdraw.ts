import { Router, type Request, type Response } from "express";
import {
  StakeWithdrawRequestSchema,
  StakeWithdrawResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import {
  defaultStakePayoutDeps,
  type StakePayoutDeps,
  withdrawStakePrincipal,
} from "../services/stakePayoutService.js";

function isBusinessRuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /No staked principal is available to withdraw|exceeds staked principal/i.test(
    error.message
  );
}

export function createStakeWithdrawRouter(
  deps: StakePayoutDeps = defaultStakePayoutDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = StakeWithdrawRequestSchema.parse(req.body);
      const response = StakeWithdrawResponseSchema.parse(
        await withdrawStakePrincipal(request, deps)
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

      console.error("Stake withdraw error:", err);
      res.status(500).json({
        error: "Failed to withdraw staked principal",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
}

export const stakeWithdrawRouter = createStakeWithdrawRouter();
