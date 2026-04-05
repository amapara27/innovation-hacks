import type {
  AnalyzeTransactionsResponse,
  GreenScoreResponse,
  RecommendationActionRequest,
  RecommendationActionResponse,
  StakingInfoResponse,
  SwapSuggestionsRequest,
  SwapSuggestionsResponse,
  WalletStateResponse,
} from "@carboniq/contracts";
import {
  DEFAULT_TRANSACTION_LIMIT,
  OffsetStatus,
  type AnalyzeTransactionsResponse as AnalyzeTransactionsResponseType,
} from "@carboniq/contracts";
import { clampGreenScore, getGreenScoreTier } from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import { getNetAccruedYieldForUser } from "./behaviorIncentiveService.js";
import {
  computeEffectiveApyWithBase,
  computeGreenBonus,
} from "./stakingService.js";
import { getProtocolBaseApy } from "./stakingRateService.js";
import { getNetStakedPrincipalForUser } from "./stakePayoutService.js";
import { buildRankedLeaderboardEntries } from "./leaderboardService.js";

function inferTransactionSource(
  plaidAccessToken?: string,
  sourceLabel?: string
): string {
  if (plaidAccessToken) {
    return "plaid";
  }
  if (sourceLabel?.startsWith("preset:")) {
    return "preset";
  }
  if (sourceLabel?.startsWith("upload")) {
    return "upload";
  }
  return "seeded";
}

export async function ensureUser(walletAddress: string) {
  return prisma.user.upsert({
    where: { walletAddress },
    update: {},
    create: {
      walletAddress,
      greenScore: 0,
      greenScoreCurrent: 0,
      greenTierCurrent: "seedling",
    },
  });
}

export async function markLatestUpload(
  wallet: string,
  latestUploadAt: string,
  latestUploadSourceLabel: string
): Promise<void> {
  const user = await ensureUser(wallet);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      latestUploadAt: new Date(latestUploadAt),
      latestUploadSourceLabel,
    },
  });
}

export async function persistAnalyzedTransactions(input: {
  wallet: string;
  response: AnalyzeTransactionsResponse;
  plaidAccessToken?: string;
  sourceLabel?: string;
}): Promise<void> {
  const user = await ensureUser(input.wallet);
  const source = inferTransactionSource(input.plaidAccessToken, input.sourceLabel);

  for (const transaction of input.response.transactions) {
    await prisma.transaction.upsert({
      where: {
        walletAddress_transactionId: {
          walletAddress: input.wallet,
          transactionId: transaction.transactionId,
        },
      },
      update: {
        description: transaction.description,
        amountUsd: transaction.amountUsd,
        mccCode: transaction.mccCode,
        date: new Date(transaction.date),
        category: transaction.category,
        emissionFactor: transaction.emissionFactor,
        co2eGrams: transaction.co2eGrams,
        source,
        sourceLabel: input.sourceLabel,
        analyzedAt: new Date(input.response.analyzedAt),
      },
      create: {
        userId: user.id,
        walletAddress: input.wallet,
        transactionId: transaction.transactionId,
        description: transaction.description,
        amountUsd: transaction.amountUsd,
        mccCode: transaction.mccCode,
        date: new Date(transaction.date),
        category: transaction.category,
        emissionFactor: transaction.emissionFactor,
        co2eGrams: transaction.co2eGrams,
        source,
        sourceLabel: input.sourceLabel,
        analyzedAt: new Date(input.response.analyzedAt),
      },
    });
  }
}

export async function persistRecommendationRun(input: {
  request: SwapSuggestionsRequest;
  response: SwapSuggestionsResponse;
  narratorProvider: string;
  model?: string;
  promptHash?: string;
}): Promise<void> {
  const user = await ensureUser(input.request.wallet);

  await prisma.recommendationRun.create({
    data: {
      userId: user.id,
      walletAddress: input.request.wallet,
      categoriesRequested: input.request.categories ?? [],
      suggestions: input.response.suggestions,
      totalPotentialSavingsMonthly: input.response.totalPotentialSavingsMonthly,
      narratorProvider: input.narratorProvider,
      model: input.model,
      promptHash: input.promptHash,
    },
  });
}

export async function persistRecommendationAction(
  input: RecommendationActionRequest
): Promise<RecommendationActionResponse> {
  const user = await ensureUser(input.wallet);
  const latestRun = await prisma.recommendationRun.findFirst({
    where: { walletAddress: input.wallet },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!latestRun) {
    throw new Error("No recommendation run exists for this wallet yet.");
  }

  const action = await prisma.recommendationAction.create({
    data: {
      userId: user.id,
      walletAddress: input.wallet,
      recommendationRunId: latestRun.id,
      suggestionKey: input.suggestionKey,
      action: input.action,
    },
  });

  return {
    wallet: input.wallet,
    suggestionKey: input.suggestionKey,
    action: input.action,
    actedAt: new Date(action.actedAt).toISOString(),
  };
}

function rehydrateAnalysis(
  wallet: string,
  transactions: Array<{
    transactionId: string;
    description: string;
    amountUsd: number;
    mccCode?: string | null;
    category: string;
    co2eGrams: number;
    emissionFactor: number;
    date: Date;
    analyzedAt: Date;
  }>
): AnalyzeTransactionsResponseType | null {
  if (transactions.length === 0) {
    return null;
  }

  const categoryBreakdown = Object.fromEntries(
    [
      "transportation",
      "food_dining",
      "groceries",
      "utilities",
      "shopping",
      "travel",
      "gas_fuel",
      "home",
      "entertainment",
      "health",
      "other",
    ].map((category) => [category, 0])
  ) as Record<string, number>;

  let totalCo2eGrams = 0;
  for (const transaction of transactions) {
    totalCo2eGrams += transaction.co2eGrams;
    categoryBreakdown[transaction.category] =
      (categoryBreakdown[transaction.category] ?? 0) + transaction.co2eGrams;
  }

  return {
    wallet,
    transactionCount: transactions.length,
    totalCo2eGrams: Number(totalCo2eGrams.toFixed(2)),
    categoryBreakdown: Object.fromEntries(
      Object.entries(categoryBreakdown).map(([category, value]) => [
        category,
        Number(value.toFixed(2)),
      ])
    ),
    transactions: transactions.map((transaction) => ({
      transactionId: transaction.transactionId,
      description: transaction.description,
      amountUsd: transaction.amountUsd,
      mccCode: transaction.mccCode ?? undefined,
      category: transaction.category as AnalyzeTransactionsResponse["transactions"][number]["category"],
      co2eGrams: transaction.co2eGrams,
      emissionFactor: transaction.emissionFactor,
      date: transaction.date.toISOString(),
    })),
    analyzedAt: transactions[0]!.analyzedAt.toISOString(),
  };
}

async function getLatestUploadedTransactions(wallet: string): Promise<{
  hasUploadedTransactions: boolean;
  latestUploadAt?: string;
  transactions: Array<{
    transactionId: string;
    walletAddress: string;
    description: string;
    amountUsd: number;
    mccCode?: string | null;
    category: string;
    co2eGrams: number;
    emissionFactor: number;
    date: Date;
    sourceLabel?: string | null;
    analyzedAt: Date;
  }>;
}> {
  const user = await prisma.user.findUnique({
    where: { walletAddress: wallet },
    select: {
      latestUploadAt: true,
      latestUploadSourceLabel: true,
    },
  });

  if (!user?.latestUploadSourceLabel) {
    return {
      hasUploadedTransactions: false,
      latestUploadAt: undefined,
      transactions: [],
    };
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      walletAddress: wallet,
      sourceLabel: user.latestUploadSourceLabel,
    },
    orderBy: [{ date: "desc" }, { transactionId: "asc" }],
    take: DEFAULT_TRANSACTION_LIMIT,
  });

  return {
    hasUploadedTransactions: transactions.length > 0,
    latestUploadAt:
      user.latestUploadAt instanceof Date
        ? user.latestUploadAt.toISOString()
        : undefined,
    transactions,
  };
}

async function getStoredGreenScore(wallet: string): Promise<GreenScoreResponse | null> {
  const user = await prisma.user.findUnique({
    where: { walletAddress: wallet },
    select: {
      greenScore: true,
      greenTierCurrent: true,
      breakdownTransactionEfficiency: true,
      breakdownSpendingHabits: true,
      breakdownCarbonOffsets: true,
      breakdownCommunityImpact: true,
    },
  });

  if (!user) {
    return null;
  }

  const leaderboardUsers = (await prisma.user.findMany({
    where: { greenScore: { gt: 0 } },
    select: {
      walletAddress: true,
      greenScore: true,
      totalCo2eOffset: true,
    },
  })) as Array<{
    walletAddress: string;
    greenScore: number;
    totalCo2eOffset?: number | null;
  }>;
  const rankedEntries = buildRankedLeaderboardEntries(
    leaderboardUsers.map((leaderboardUser) => ({
      wallet: leaderboardUser.walletAddress,
      score: clampGreenScore(leaderboardUser.greenScore),
      totalCo2eOffset: leaderboardUser.totalCo2eOffset ?? 0,
    }))
  );
  const placement = rankedEntries.find((entry) => entry.wallet === wallet);

  return {
    wallet,
    score: clampGreenScore(user.greenScore ?? 0),
    tier: getGreenScoreTier(user.greenScore ?? 0),
    breakdown: {
      transactionEfficiency: user.breakdownTransactionEfficiency ?? 0,
      spendingHabits: user.breakdownSpendingHabits ?? 0,
      carbonOffsets: user.breakdownCarbonOffsets ?? 0,
      communityImpact: user.breakdownCommunityImpact ?? 0,
    },
    rank: placement?.rank,
    totalUsers: rankedEntries.length || undefined,
  };
}

async function getStoredStakingInfo(
  wallet: string
): Promise<StakingInfoResponse | null> {
  const user = await prisma.user.findUnique({
    where: { walletAddress: wallet },
    select: {
      id: true,
      greenScore: true,
      stakingStakedAmount: true,
      stakeVaultAddress: true,
    },
  });

  if (!user) {
    return null;
  }

  const [accruedYield, stakedFromRecords] = await Promise.all([
    getNetAccruedYieldForUser(user.id),
    getNetStakedPrincipalForUser(user.id),
  ]);
  const stakedAmount =
    stakedFromRecords === 0
      ? Math.max(0, user.stakingStakedAmount ?? 0)
      : stakedFromRecords;
  const greenScore = clampGreenScore(user.greenScore ?? 0);
  const baseApy = await getProtocolBaseApy();
  const greenBonus = computeGreenBonus(greenScore);
  const effectiveApy = computeEffectiveApyWithBase(greenScore, baseApy);

  return {
    wallet,
    greenScore,
    baseApy: Number(baseApy.toFixed(4)),
    greenBonus: Number(greenBonus.toFixed(4)),
    effectiveApy: Number(effectiveApy.toFixed(4)),
    stakedAmount,
    accruedYield,
    stakeVaultAddress: user.stakeVaultAddress ?? undefined,
  };
}

async function getLatestRecommendations(wallet: string) {
  const latestRun = await prisma.recommendationRun.findFirst({
    where: { walletAddress: wallet },
    orderBy: { createdAt: "desc" },
    select: {
      suggestions: true,
      totalPotentialSavingsMonthly: true,
      walletAddress: true,
    },
  });

  if (!latestRun) {
    return null;
  }

  return {
    wallet: latestRun.walletAddress,
    suggestions: latestRun.suggestions as SwapSuggestionsResponse["suggestions"],
    totalPotentialSavingsMonthly: latestRun.totalPotentialSavingsMonthly,
  } satisfies SwapSuggestionsResponse;
}

async function getAdoptedSuggestionKeys(wallet: string): Promise<string[]> {
  const actions = await prisma.recommendationAction.findMany({
    where: { walletAddress: wallet },
    orderBy: [{ actedAt: "desc" }, { id: "desc" }],
    select: {
      suggestionKey: true,
      action: true,
    },
  });

  const latestBySuggestion = new Map<string, string>();
  for (const action of actions) {
    if (!latestBySuggestion.has(action.suggestionKey)) {
      latestBySuggestion.set(action.suggestionKey, action.action);
    }
  }

  return [...latestBySuggestion.entries()]
    .filter(([, action]) => action === "adopted")
    .map(([suggestionKey]) => suggestionKey);
}

export async function getWalletState(
  wallet: string
): Promise<WalletStateResponse> {
  const [{ hasUploadedTransactions, latestUploadAt, transactions }, greenScore, stakingInfo, latestRecommendations, adoptedSuggestionKeys] =
    await Promise.all([
      getLatestUploadedTransactions(wallet),
      getStoredGreenScore(wallet),
      getStoredStakingInfo(wallet),
      getLatestRecommendations(wallet),
      getAdoptedSuggestionKeys(wallet),
    ]);

  return {
    wallet,
    hasUploadedTransactions,
    latestUploadAt,
    analysis: rehydrateAnalysis(wallet, transactions),
    greenScore,
    stakingInfo,
    latestRecommendations,
    adoptedSuggestionKeys,
  };
}

export async function getPersistedUploadTransactions(wallet: string): Promise<
  Array<{
    transactionId: string;
    description: string;
    amountUsd: number;
    mccCode?: string | null;
    date: Date;
  }>
> {
  const { transactions } = await getLatestUploadedTransactions(wallet);

  return transactions.map((transaction) => ({
    transactionId: transaction.transactionId,
    description: transaction.description,
    amountUsd: transaction.amountUsd,
    mccCode: transaction.mccCode ?? null,
    date: transaction.date,
  }));
}
