import { Router, type Request, type Response } from "express";
import {
  SimulateStakeTimelineRequestSchema,
  SimulateStakeTimelineResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { simulateStakeTimeline } from "../services/stakingService.js";
import { getProtocolBaseApy } from "../services/stakingRateService.js";

export const simulateStakeTimelineRouter = Router();

simulateStakeTimelineRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { principal, currentAccruedYield, greenScore, horizonDays } =
      SimulateStakeTimelineRequestSchema.parse(req.body);
    const baseApy = await getProtocolBaseApy();

    const response = SimulateStakeTimelineResponseSchema.parse(
      simulateStakeTimeline(
        principal,
        currentAccruedYield,
        greenScore,
        horizonDays,
        baseApy
      )
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
    console.error("Stake timeline simulation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
