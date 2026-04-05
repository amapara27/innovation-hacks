import {
  GREEN_SCORE_WEIGHTS,
  OffsetStatus,
  type GreenScoreBreakdown,
  type GreenScoreResponse,
} from "@carboniq/contracts";
import { clampGreenScore, getGreenScoreTier } from "../lib/blockchain.js";
import {
  CATEGORY_ORDER,
  ESSENTIAL_CATEGORIES,
  SUSTAINABILITY_POINTS,
} from "../lib/aiRules.js";
import { clampNumber, roundTo } from "../lib/aiMath.js";
import { prisma } from "../lib/prisma.js";
import { emissionsService } from "./emissionsService.js";

export function computeWeightedScore(
  breakdown: GreenScoreBreakdown | Record<keyof typeof GREEN_SCORE_WEIGHTS, number>
): number {
  return roundTo(
    breakdown.transactionEfficiency * GREEN_SCORE_WEIGHTS.transactionEfficiency +
      breakdown.spendingHabits * GREEN_SCORE_WEIGHTS.spendingHabits +
      breakdown.carbonOffsets * GREEN_SCORE_WEIGHTS.carbonOffsets +
      breakdown.communityImpact * GREEN_SCORE_WEIGHTS.communityImpact,
    2
  );
}

export async function refreshStoredGreenScore(
  wallet: string
): Promise<GreenScoreResponse> {
  const snapshot = emissionsService.getCanonicalSnapshot(wallet);
  const confirmedOffsets = await prisma.impactRecord.findMany({
    where: {
      walletAddress: wallet,
      status: OffsetStatus.RECORDED_ON_CHAIN,
    },
    select: {
      co2OffsetGrams: true,
    },
  });

  const confirmedOffsetGrams = confirmedOffsets.reduce(
    (sum, offset) => sum + offset.co2OffsetGrams,
    0
  );
  const offsetCount = confirmedOffsets.length;

  let transactionEfficiency = 100;
  let spendingHabits = 100;
  let essentialSpendShare = 0;

  if (snapshot.totalSpendUsd > 0) {
    const intensity = snapshot.totalCo2eGrams / snapshot.totalSpendUsd;
    transactionEfficiency = clampNumber((100 * (400 - intensity)) / 325, 0, 100);

    let weightedPoints = 0;
    let essentialSpend = 0;
    for (const category of CATEGORY_ORDER) {
      const spend = snapshot.categorySpendTotals[category];
      weightedPoints += spend * SUSTAINABILITY_POINTS[category];
      if (ESSENTIAL_CATEGORIES.has(category)) {
        essentialSpend += spend;
      }
    }

    spendingHabits = clampNumber(weightedPoints / snapshot.totalSpendUsd, 0, 100);
    essentialSpendShare =
      snapshot.totalSpendUsd === 0 ? 0 : essentialSpend / snapshot.totalSpendUsd;
  }

  const carbonOffsets =
    snapshot.totalCo2eGrams === 0
      ? 100
      : clampNumber(
          (confirmedOffsetGrams / snapshot.totalCo2eGrams) * 100,
          0,
          100
        );

  const communityImpact = clampNumber(
    20 + 50 * essentialSpendShare + 30 * (Math.min(offsetCount, 3) / 3),
    0,
    100
  );

  const breakdown: GreenScoreBreakdown = {
    transactionEfficiency: roundTo(transactionEfficiency, 2),
    spendingHabits: roundTo(spendingHabits, 2),
    carbonOffsets: roundTo(carbonOffsets, 2),
    communityImpact: roundTo(communityImpact, 2),
  };

  const score = clampGreenScore(computeWeightedScore(breakdown));
  const tier = getGreenScoreTier(score);

  await prisma.user.upsert({
    where: { walletAddress: wallet },
    update: {
      greenScore: score,
      greenScoreCurrent: score,
      greenTierCurrent: tier,
      breakdownTransactionEfficiency: breakdown.transactionEfficiency,
      breakdownSpendingHabits: breakdown.spendingHabits,
      breakdownCarbonOffsets: breakdown.carbonOffsets,
      breakdownCommunityImpact: breakdown.communityImpact,
      totalCo2eOffset: confirmedOffsetGrams,
      offsetCount,
    },
    create: {
      walletAddress: wallet,
      greenScore: score,
      greenScoreCurrent: score,
      greenTierCurrent: tier,
      breakdownTransactionEfficiency: breakdown.transactionEfficiency,
      breakdownSpendingHabits: breakdown.spendingHabits,
      breakdownCarbonOffsets: breakdown.carbonOffsets,
      breakdownCommunityImpact: breakdown.communityImpact,
      totalCo2eOffset: confirmedOffsetGrams,
      offsetCount,
    },
  });

  const totalUsers = await prisma.user.count({
    where: { greenScore: { gt: 0 } },
  });
  const higherScores = await prisma.user.count({
    where: { greenScore: { gt: score } },
  });

  return {
    wallet,
    score,
    tier,
    breakdown,
    rank: totalUsers > 0 ? higherScores + 1 : undefined,
    totalUsers: totalUsers || undefined,
  };
}
