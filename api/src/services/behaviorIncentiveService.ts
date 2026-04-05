import { prisma } from "../lib/prisma.js";
import { clampGreenScore } from "../lib/blockchain.js";
import { roundTo } from "../lib/aiMath.js";

const IRRESPONSIBLE_SHARE_THRESHOLD = Number(
  process.env.GREEN_SCORE_IRRESPONSIBLE_SHARE_THRESHOLD ?? 0.5
);
const IRRESPONSIBLE_SPENDING_HABITS_THRESHOLD = Number(
  process.env.GREEN_SCORE_IRRESPONSIBLE_SPENDING_THRESHOLD ?? 42
);
const STREAK_PENALTY_START = Number(
  process.env.GREEN_SCORE_STREAK_PENALTY_START ?? 2
);
const PENALTY_PER_STREAK = Number(
  process.env.GREEN_SCORE_PENALTY_PER_STREAK ?? 3
);
const MAX_STREAK_PENALTY = Number(
  process.env.GREEN_SCORE_MAX_STREAK_PENALTY ?? 24
);
const LOW_SCORE_RESET_THRESHOLD = Number(
  process.env.GREEN_SCORE_RESET_THRESHOLD ?? 25
);
const HIGH_SCORER_THRESHOLD = Number(
  process.env.REDISTRIBUTION_HIGH_SCORER_THRESHOLD ?? 70
);
const USER_REDISTRIBUTION_SHARE = Number(
  process.env.REDISTRIBUTION_TO_USERS_SHARE ?? 0.7
);

function isIrresponsibleBehavior(input: {
  spendingHabits: number;
  irresponsibleSpendShare: number;
}): boolean {
  return (
    input.spendingHabits < IRRESPONSIBLE_SPENDING_HABITS_THRESHOLD ||
    input.irresponsibleSpendShare >= IRRESPONSIBLE_SHARE_THRESHOLD
  );
}

function computePenaltyPoints(input: {
  irresponsibleStreak: number;
  irresponsibleSpendShare: number;
}): number {
  const streakOverage = Math.max(
    0,
    input.irresponsibleStreak - STREAK_PENALTY_START + 1
  );
  const streakPenalty = streakOverage * PENALTY_PER_STREAK;
  const severityPenalty = Math.max(
    0,
    Math.round((input.irresponsibleSpendShare - IRRESPONSIBLE_SHARE_THRESHOLD) * 20)
  );
  return Math.max(
    0,
    Math.min(MAX_STREAK_PENALTY, streakPenalty + severityPenalty)
  );
}

export async function applyBehaviorPenalty(input: {
  userId: string;
  baseScore: number;
  spendingHabits: number;
  irresponsibleSpendShare: number;
  snapshotFingerprint: string;
}): Promise<{
  adjustedScore: number;
  penaltyPoints: number;
  irresponsibleStreak: number;
}> {
  const currentState = await prisma.userBehaviorState.findUnique({
    where: { userId: input.userId },
    select: {
      irresponsibleStreak: true,
      lastPenaltyPoints: true,
      lastSnapshotFingerprint: true,
    },
  });

  if (currentState?.lastSnapshotFingerprint === input.snapshotFingerprint) {
    const adjustedScore = clampGreenScore(
      input.baseScore - currentState.lastPenaltyPoints
    );
    return {
      adjustedScore,
      penaltyPoints: currentState.lastPenaltyPoints,
      irresponsibleStreak: currentState.irresponsibleStreak,
    };
  }

  const currentStreak = currentState?.irresponsibleStreak ?? 0;
  const flaggedIrresponsible = isIrresponsibleBehavior({
    spendingHabits: input.spendingHabits,
    irresponsibleSpendShare: input.irresponsibleSpendShare,
  });
  const nextStreak = flaggedIrresponsible
    ? currentStreak + 1
    : Math.max(0, currentStreak - 1);

  const penaltyPoints = computePenaltyPoints({
    irresponsibleStreak: nextStreak,
    irresponsibleSpendShare: input.irresponsibleSpendShare,
  });
  const adjustedScore = clampGreenScore(input.baseScore - penaltyPoints);

  await prisma.userBehaviorState.upsert({
    where: { userId: input.userId },
    update: {
      irresponsibleStreak: nextStreak,
      lastPenaltyPoints: penaltyPoints,
      lastIrresponsibleShare: input.irresponsibleSpendShare,
      lastSnapshotFingerprint: input.snapshotFingerprint,
    },
    create: {
      userId: input.userId,
      irresponsibleStreak: nextStreak,
      lastPenaltyPoints: penaltyPoints,
      lastIrresponsibleShare: input.irresponsibleSpendShare,
      lastSnapshotFingerprint: input.snapshotFingerprint,
    },
  });

  return {
    adjustedScore,
    penaltyPoints,
    irresponsibleStreak: nextStreak,
  };
}

async function getConfirmedYieldEstimate(userId: string): Promise<number> {
  const stakeAgg = await prisma.stakeRecord.aggregate({
    where: {
      userId,
      solanaTxHash: { not: null },
      status: "confirmed",
    },
    _sum: { estimatedYield: true },
  });
  return stakeAgg._sum.estimatedYield ?? 0;
}

async function getResetDebits(userId: string): Promise<number> {
  const agg = await prisma.yieldRedistributionEvent.aggregate({
    where: { offenderUserId: userId },
    _sum: { resetAmount: true },
  });
  return Number(agg._sum.resetAmount ?? 0);
}

async function getRedistributionCredits(userId: string): Promise<number> {
  const agg = await prisma.yieldRedistributionCredit.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

export async function getNetAccruedYieldForUser(userId: string): Promise<number> {
  const [baseYield, resetDebits, redistributionCredits] = await Promise.all([
    getConfirmedYieldEstimate(userId),
    getResetDebits(userId),
    getRedistributionCredits(userId),
  ]);

  const netYield = baseYield - resetDebits + redistributionCredits;
  return roundTo(Math.max(0, netYield), 6);
}

export async function enforceLowScoreYieldReset(input: {
  offenderUserId: string;
  offenderWallet: string;
  score: number;
}): Promise<void> {
  if (input.score > LOW_SCORE_RESET_THRESHOLD) {
    return;
  }

  const currentAccrued = await getNetAccruedYieldForUser(input.offenderUserId);
  if (currentAccrued <= 0) {
    return;
  }

  const eligibleRows = await prisma.user.findMany({
    where: {
      id: { not: input.offenderUserId },
      greenScore: { gte: HIGH_SCORER_THRESHOLD },
    },
    orderBy: [{ greenScore: "desc" }, { createdAt: "asc" }],
    take: 100,
    select: { id: true },
  });

  const hasEligibleUsers = eligibleRows.length > 0;
  const usersShareRaw = hasEligibleUsers
    ? roundTo(currentAccrued * USER_REDISTRIBUTION_SHARE, 6)
    : 0;
  const nonprofitShareRaw = roundTo(currentAccrued - usersShareRaw, 6);

  const event = await prisma.yieldRedistributionEvent.create({
    data: {
      offenderUserId: input.offenderUserId,
      offenderWallet: input.offenderWallet,
      triggeredScore: input.score,
      resetAmount: currentAccrued,
      redistributedToUsers: usersShareRaw,
      redistributedToNonprofits: nonprofitShareRaw,
      reason: "low_score_reset",
    },
    select: { id: true },
  });

  let creditedToUsers = 0;
  if (hasEligibleUsers && usersShareRaw > 0) {
    const perUser = roundTo(usersShareRaw / eligibleRows.length, 6);
    if (perUser > 0) {
      await prisma.yieldRedistributionCredit.createMany({
        data: eligibleRows.map((row) => ({
          eventId: event.id,
          userId: row.id,
          amount: perUser,
        })),
      });
      creditedToUsers = roundTo(perUser * eligibleRows.length, 6);
    }
  }

  const nonprofitShare = roundTo(currentAccrued - creditedToUsers, 6);
  if (nonprofitShare > 0) {
    await prisma.sustainabilityFundLedger.create({
      data: {
        eventId: event.id,
        amount: nonprofitShare,
        note: `reset_from_${input.offenderWallet}`,
      },
    });
  }
}
