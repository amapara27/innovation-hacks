/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  GET /api/leaderboard                                                   ║
 * ║  Green Score leaderboard from stored scores.                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  LEADERBOARD_PAGE_SIZE,
  LeaderboardRequestSchema,
  LeaderboardResponseSchema,
} from "@carboniq/contracts";
import {
  clampGreenScore,
  getGreenScoreTier,
  shortenWallet,
} from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = LeaderboardRequestSchema.parse({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });

    const skip = (page - 1) * pageSize;

    // Get total count
    const totalEntries = await prisma.user.count({
      where: { greenScore: { gt: 0 } },
    });

    // Get paginated users sorted by green score
    const users = await prisma.user.findMany({
      where: { greenScore: { gt: 0 } },
      orderBy: { greenScore: "desc" },
      skip,
      take: pageSize,
      include: {
        impacts: {
          select: { co2OffsetGrams: true },
        },
      },
    });

    const entries = users.map((user, index) => {
      const totalCo2eOffset = user.impacts.reduce(
        (sum, impact) => sum + impact.co2OffsetGrams,
        0
      );

      return {
        rank: skip + index + 1,
        wallet: user.walletAddress,
        walletShort: shortenWallet(user.walletAddress),
        score: clampGreenScore(user.greenScore),
        tier: getGreenScoreTier(user.greenScore),
        totalCo2eOffset,
      };
    });

    const totalPages = Math.ceil(totalEntries / pageSize);

    const response = LeaderboardResponseSchema.parse({
      entries,
      totalEntries,
      page,
      pageSize,
      totalPages,
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
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
