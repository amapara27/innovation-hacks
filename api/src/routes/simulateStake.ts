/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  POST /api/simulate-stake                                               ║
 * ║  Simulates staking yield with Green Score continuous curve bonus.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  SimulateStakeRequestSchema,
  SimulateStakeResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { simulateStake } from "../services/stakingService.js";
import { getProtocolBaseApy } from "../services/stakingRateService.js";

export const simulateStakeRouter = Router();

/**
 * POST /api/simulate-stake
 * Simulates staking yield with a green score bonus (continuous curve).
 */
simulateStakeRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { amount, durationDays, greenScore } = SimulateStakeRequestSchema.parse(
      req.body
    );
    const baseApy = await getProtocolBaseApy();

    const result = SimulateStakeResponseSchema.parse(
      simulateStake(amount, durationDays, greenScore, baseApy)
    );
    res.json(result);
  } catch (err) {
    if (isZodLikeError(err)) {
      res.status(400).json({
        error: "Validation error",
        details: getZodLikeDetails(err),
      });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});
