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
} from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import { buildRankedLeaderboardEntries } from "../services/leaderboardService.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = LeaderboardRequestSchema.parse({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });

    const skip = (page - 1) * pageSize;

    const users = (await prisma.user.findMany({
      where: { greenScore: { gt: 0 } },
      orderBy: { greenScore: "desc" },
      include: {
        impacts: {
          select: { co2OffsetGrams: true },
        },
      },
    })) as Array<{
      walletAddress: string;
      greenScore: number;
      impacts: Array<{ co2OffsetGrams: number }>;
    }>;

    const realEntries = users.map((user) => {
      const totalCo2eOffset = user.impacts.reduce(
        (sum: number, impact: { co2OffsetGrams: number }) =>
          sum + impact.co2OffsetGrams,
        0
      );

      return {
        wallet: user.walletAddress,
        score: clampGreenScore(user.greenScore),
        totalCo2eOffset,
      };
    });
    const rankedEntries = buildRankedLeaderboardEntries(realEntries);

    const entries = rankedEntries.slice(skip, skip + pageSize);
    const totalEntries = rankedEntries.length;
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
