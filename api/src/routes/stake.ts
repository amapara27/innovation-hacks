import { Router, type Request, type Response } from "express";
import {
  StakeRequestSchema,
  StakeResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import {
  defaultStakeExecutionDeps,
  executeDemoStake,
  type StakeExecutionDeps,
} from "../services/stakeExecutionService.js";

export function createStakeRouter(
  deps: StakeExecutionDeps = defaultStakeExecutionDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = StakeRequestSchema.parse(req.body);
      const response = StakeResponseSchema.parse(
        await executeDemoStake(request, deps)
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
      console.error("Stake error:", err);
      res.status(500).json({
        error: "Failed to execute stake",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
}

export const stakeRouter = createStakeRouter();
