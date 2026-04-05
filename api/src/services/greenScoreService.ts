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
import {
  applyBehaviorPenalty,
  enforceLowScoreYieldReset,
} from "./behaviorIncentiveService.js";

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

  const baseScore = clampGreenScore(computeWeightedScore(breakdown));
  const baseTier = getGreenScoreTier(baseScore);
  const user = await prisma.user.upsert({
    where: { walletAddress: wallet },
    update: {
      greenScore: baseScore,
      greenScoreCurrent: baseScore,
      greenTierCurrent: baseTier,
      breakdownTransactionEfficiency: breakdown.transactionEfficiency,
      breakdownSpendingHabits: breakdown.spendingHabits,
      breakdownCarbonOffsets: breakdown.carbonOffsets,
      breakdownCommunityImpact: breakdown.communityImpact,
      totalCo2eOffset: confirmedOffsetGrams,
      offsetCount,
    },
    create: {
      walletAddress: wallet,
      greenScore: baseScore,
      greenScoreCurrent: baseScore,
      greenTierCurrent: baseTier,
      breakdownTransactionEfficiency: breakdown.transactionEfficiency,
      breakdownSpendingHabits: breakdown.spendingHabits,
      breakdownCarbonOffsets: breakdown.carbonOffsets,
      breakdownCommunityImpact: breakdown.communityImpact,
      totalCo2eOffset: confirmedOffsetGrams,
      offsetCount,
    },
  });
  const irresponsibleSpend =
    snapshot.categorySpendTotals.travel +
    snapshot.categorySpendTotals.gas_fuel +
    snapshot.categorySpendTotals.transportation +
    snapshot.categorySpendTotals.shopping;
  const irresponsibleSpendShare =
    snapshot.totalSpendUsd > 0 ? irresponsibleSpend / snapshot.totalSpendUsd : 0;
  const snapshotFingerprint = [
    snapshot.response.transactionCount,
    roundTo(snapshot.totalSpendUsd, 2),
    roundTo(snapshot.totalCo2eGrams, 2),
    roundTo(breakdown.spendingHabits, 2),
    roundTo(irresponsibleSpendShare, 4),
  ].join(":");

  const { adjustedScore } = await applyBehaviorPenalty({
    userId: user.id,
    baseScore,
    spendingHabits: breakdown.spendingHabits,
    irresponsibleSpendShare,
    snapshotFingerprint,
  });

  const score = clampGreenScore(adjustedScore);
  const tier = getGreenScoreTier(score);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      greenScore: score,
      greenScoreCurrent: score,
      greenTierCurrent: tier,
    },
  });
  await enforceLowScoreYieldReset({
    offenderUserId: user.id,
    offenderWallet: wallet,
    score,
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
