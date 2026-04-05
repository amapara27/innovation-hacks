/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  GET /api/nft-metadata                                                  ║
 * ║  Metaplex-compatible Impact NFT metadata.                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  ImpactNftMetadataSchema,
  StakingInfoRequestSchema,
} from "@carboniq/contracts";
import {
  clampGreenScore,
  getGreenScoreTier,
  getNftRarity,
  titleCaseIdentifier,
} from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";

export const nftMetadataRouter = Router();

nftMetadataRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { wallet } = StakingInfoRequestSchema.parse({
      wallet: req.query.wallet,
    });

    const user = (await prisma.user.findUnique({
      where: { walletAddress: wallet },
      include: {
        impacts: {
          select: { co2OffsetGrams: true, creditType: true },
        },
      },
    })) as
      | {
          greenScore: number;
          impacts: Array<{ co2OffsetGrams: number; creditType: string }>;
        }
      | null;

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const totalCo2eOffset = user.impacts.reduce(
      (sum: number, i: { co2OffsetGrams: number }) => sum + i.co2OffsetGrams,
      0
    );

    // Find most common credit type
    const creditTypeCounts = user.impacts.reduce(
      (acc: Record<string, number>, i: { creditType: string }) => {
        acc[i.creditType] = (acc[i.creditType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const primaryCreditType =
      Object.entries(creditTypeCounts).sort(
        ([, a], [, b]) => Number(b) - Number(a)
      )[0]?.[0] ?? "forestry";

    const score = clampGreenScore(user.greenScore);
    const tier = getGreenScoreTier(score);
    const rarity = getNftRarity(score);

    // Placeholder image URI — static for hackathon
    const imageUri =
      "https://arweave.net/placeholder-carboniq-impact-nft.png";

    const metadata = ImpactNftMetadataSchema.parse({
      name: `CarbonIQ Impact - ${titleCaseIdentifier(tier)}`,
      symbol: "CIQNFT",
      description: `Proof of environmental impact: ${totalCo2eOffset.toLocaleString()}g CO2 offset. Green Score: ${score} (${titleCaseIdentifier(tier)} tier).`,
      image: imageUri,
      external_url: `https://carboniq.app/impact/${wallet}`,
      attributes: [
        { trait_type: "Green Score", value: score },
        { trait_type: "Tier", value: tier },
        { trait_type: "Total CO2 Offset (g)", value: totalCo2eOffset },
        { trait_type: "Primary Credit Type", value: primaryCreditType },
        { trait_type: "Rarity", value: rarity },
        { trait_type: "Offset Count", value: user.impacts.length },
      ],
      properties: {
        category: "image" as const,
        files: [{ uri: imageUri, type: "image/png" }],
        creators: [{ address: wallet, share: 100 }],
      },
    });

    res.json(metadata);
  } catch (err) {
    if (isZodLikeError(err)) {
      res.status(400).json({
        error: "Validation error",
        details: getZodLikeDetails(err),
      });
      return;
    }
    console.error("NFT metadata error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
