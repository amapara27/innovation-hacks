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
import { getStakeVaultAddress } from "../services/stakeExecutionService.js";
import { prisma } from "../lib/prisma.js";
import { clampGreenScore } from "../lib/blockchain.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { getNetAccruedYieldForUser } from "../services/behaviorIncentiveService.js";
import { getNetStakedPrincipalForUser } from "../services/stakePayoutService.js";

export const stakingInfoRouter = Router();

function safeStakeVaultAddress(): string | undefined {
  try {
    return getStakeVaultAddress().toBase58();
  } catch {
    return undefined;
  }
}

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

    const stakedAmount = await getNetStakedPrincipalForUser(user.id);
    const accruedYield = await getNetAccruedYieldForUser(user.id);

    const response = StakingInfoResponseSchema.parse({
      wallet,
      greenScore,
      baseApy: parseFloat(baseApy.toFixed(4)),
      greenBonus: parseFloat(greenBonus.toFixed(4)),
      effectiveApy: parseFloat(effectiveApy.toFixed(4)),
      stakedAmount,
      accruedYield: parseFloat(accruedYield.toFixed(6)),
      stakeVaultAddress: safeStakeVaultAddress(),
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
