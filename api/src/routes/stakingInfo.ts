/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  GET /api/staking-info                                                  ║
 * ║  Returns staking info for a wallet including Green Score yield boost.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  StakingInfoRequestSchema,
  StakingInfoResponseSchema,
} from "@carboniq/contracts";
import {
  computeGreenBonus,
  computeEffectiveApyWithBase,
} from "../services/stakingService.js";
import { getProtocolBaseApy } from "../services/stakingRateService.js";
import { prisma } from "../lib/prisma.js";
import { clampGreenScore } from "../lib/blockchain.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";

export const stakingInfoRouter = Router();

stakingInfoRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { wallet } = StakingInfoRequestSchema.parse({
      wallet: req.query.wallet,
    });

    // Upsert user — create if doesn't exist
    const user = await prisma.user.upsert({
      where: { walletAddress: wallet },
      update: {},
      create: {
        walletAddress: wallet,
        greenScore: 0,
      },
    });

    const greenScore = clampGreenScore(user.greenScore);
    const baseApy = await getProtocolBaseApy();
    const greenBonus = computeGreenBonus(greenScore);
    const effectiveApy = computeEffectiveApyWithBase(greenScore, baseApy);

    // Report only executed demo stake transfers, not legacy simulation rows.
    const stakeAgg = await prisma.stakeRecord.aggregate({
      where: {
        userId: user.id,
        solanaTxHash: { not: null },
        status: "confirmed",
      },
      _sum: { amount: true, estimatedYield: true },
    });

    const response = StakingInfoResponseSchema.parse({
      wallet,
      greenScore,
      baseApy: parseFloat(baseApy.toFixed(4)),
      greenBonus: parseFloat(greenBonus.toFixed(4)),
      effectiveApy: parseFloat(effectiveApy.toFixed(4)),
      stakedAmount: stakeAgg._sum.amount ?? 0,
      accruedYield: parseFloat(
        (stakeAgg._sum.estimatedYield ?? 0).toFixed(6)
      ),
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
    console.error("Staking info error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
