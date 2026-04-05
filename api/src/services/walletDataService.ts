import type {
  AnalyzeTransactionsResponse,
  SwapSuggestionsRequest,
  SwapSuggestionsResponse,
} from "@carboniq/contracts";
import { prisma } from "../lib/prisma.js";

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
  if (sourceLabel === "upload") {
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
