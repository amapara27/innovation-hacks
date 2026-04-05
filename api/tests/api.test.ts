import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { type Router } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  CarbonCreditType,
  EmissionCategory,
  OffsetStatus,
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";

process.env.NODE_ENV = "test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "Set TEST_DATABASE_URL or DATABASE_URL before running API tests against MongoDB."
  );
}
process.env.DATABASE_URL = testDatabaseUrl;

type PrismaModule = typeof import("../src/lib/prisma.js");
type AnalyzeTransactionsRouteModule = typeof import("../src/routes/analyzeTransactions.js");
type DemoConnectBankRouteModule = typeof import("../src/routes/demoConnectBank.js");
type GreenScoreRouteModule = typeof import("../src/routes/greenScore.js");
type SwapSuggestionsRouteModule = typeof import("../src/routes/swapSuggestions.js");
type TriggerOffsetRouteModule = typeof import("../src/routes/triggerOffset.js");
type SimulateStakeRouteModule = typeof import("../src/routes/simulateStake.js");
type StakeRouteModule = typeof import("../src/routes/stake.js");
type StakingInfoRouteModule = typeof import("../src/routes/stakingInfo.js");
type LeaderboardRouteModule = typeof import("../src/routes/leaderboard.js");
type NftMetadataRouteModule = typeof import("../src/routes/nftMetadata.js");
type RecordOffsetRouteModule = typeof import("../src/routes/recordOffset.js");
type GreenScoreServiceModule = typeof import("../src/services/greenScoreService.js");

let prismaModule: PrismaModule;
let analyzeTransactionsRouteModule: AnalyzeTransactionsRouteModule;
let demoConnectBankRouteModule: DemoConnectBankRouteModule;
let greenScoreRouteModule: GreenScoreRouteModule;
let swapSuggestionsRouteModule: SwapSuggestionsRouteModule;
let triggerOffsetRouteModule: TriggerOffsetRouteModule;
let simulateStakeRouteModule: SimulateStakeRouteModule;
let stakeRouteModule: StakeRouteModule;
let stakingInfoRouteModule: StakingInfoRouteModule;
let leaderboardRouteModule: LeaderboardRouteModule;
let nftMetadataRouteModule: NftMetadataRouteModule;
let recordOffsetRouteModule: RecordOffsetRouteModule;
let greenScoreServiceModule: GreenScoreServiceModule;

const MONGO_COLLECTIONS = [
  "RecommendationAction",
  "RecommendationRun",
  "SustainabilityFundLedger",
  "YieldRedistributionCredit",
  "YieldRedistributionEvent",
  "UserBehaviorState",
  "ImpactRecord",
  "StakeRecord",
  "Transaction",
  "ProtocolRateSnapshot",
  "User",
] as const;

function getRouteHandler(router: Router, method: "GET" | "POST") {
  const lowerMethod = method.toLowerCase();
  const layer = (
    router as unknown as {
      stack: Array<{
        route?: {
          methods: Record<string, boolean>;
          stack: Array<{ handle: Function }>;
        };
      }>;
    }
  ).stack.find((candidate) => candidate.route?.methods?.[lowerMethod]);

  if (!layer?.route?.stack[0]?.handle) {
    throw new Error(`Unable to find ${method} handler in router`);
  }

  return layer.route.stack[0].handle;
}

function queryFromSearchParams(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  }
  return query;
}

async function requestJson(
  router: Router,
  options:
    | { method: "GET"; path: string }
    | { method: "POST"; path: string; body: unknown }
) {
  const url = new URL(`http://localhost${options.path}`);
  const handler = getRouteHandler(router, options.method);

  const response = await new Promise<{ status: number; body: unknown }>(
    (resolve, reject) => {
      const result = { status: 200, body: null as unknown };
      const req = {
        method: options.method,
        path: url.pathname,
        url: options.path,
        query: queryFromSearchParams(url.searchParams),
        body: options.method === "POST" ? options.body : {},
      };
      const res = {
        status(code: number) {
          result.status = code;
          return this;
        },
        json(body: unknown) {
          result.body = body;
          resolve(result);
          return this;
        },
      };

      Promise.resolve(handler(req, res, reject)).catch(reject);
    }
  );

  return response;
}

function randomWallet(): string {
  return Keypair.generate().publicKey.toBase58();
}

before(async () => {
  prismaModule = await import("../src/lib/prisma.js");
  analyzeTransactionsRouteModule = await import(
    "../src/routes/analyzeTransactions.js"
  );
  demoConnectBankRouteModule = await import("../src/routes/demoConnectBank.js");
  greenScoreRouteModule = await import("../src/routes/greenScore.js");
  swapSuggestionsRouteModule = await import("../src/routes/swapSuggestions.js");
  triggerOffsetRouteModule = await import("../src/routes/triggerOffset.js");
  simulateStakeRouteModule = await import("../src/routes/simulateStake.js");
  stakeRouteModule = await import("../src/routes/stake.js");
  stakingInfoRouteModule = await import("../src/routes/stakingInfo.js");
  leaderboardRouteModule = await import("../src/routes/leaderboard.js");
  nftMetadataRouteModule = await import("../src/routes/nftMetadata.js");
  recordOffsetRouteModule = await import("../src/routes/recordOffset.js");
  greenScoreServiceModule = await import("../src/services/greenScoreService.js");
});

beforeEach(async () => {
  try {
    await prismaModule.prisma.recommendationAction.deleteMany();
    await prismaModule.prisma.recommendationRun.deleteMany();
    await prismaModule.prisma.sustainabilityFundLedger.deleteMany();
    await prismaModule.prisma.yieldRedistributionCredit.deleteMany();
    await prismaModule.prisma.yieldRedistributionEvent.deleteMany();
    await prismaModule.prisma.userBehaviorState.deleteMany();
    await prismaModule.prisma.impactRecord.deleteMany();
    await prismaModule.prisma.stakeRecord.deleteMany();
    await prismaModule.prisma.transaction.deleteMany();
    await prismaModule.prisma.protocolRateSnapshot.deleteMany();
    await prismaModule.prisma.user.deleteMany();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Transactions are not supported by this deployment")) {
      throw error;
    }

    for (const collection of MONGO_COLLECTIONS) {
      try {
        await prismaModule.prisma.$runCommandRaw({
          delete: collection,
          deletes: [{ q: {}, limit: 0 }],
        });
      } catch (runCommandError) {
        const runCommandMessage =
          runCommandError instanceof Error
            ? runCommandError.message
            : String(runCommandError);
        const namespaceMissing =
          runCommandMessage.includes("NamespaceNotFound") ||
          runCommandMessage.includes("ns not found");
        if (!namespaceMissing) {
          throw runCommandError;
        }
      }
    }
  }
});

after(async () => {
  await prismaModule.prisma.$disconnect();
});

describe("unified backend routes", () => {
  it("POST /api/analyze-transactions is deterministic and contract-complete", async () => {
    const wallet = "A".repeat(32);
    const payload = { wallet, limit: 5 };

    const first = await requestJson(
      analyzeTransactionsRouteModule.analyzeTransactionsRouter,
      {
        method: "POST",
        path: "/",
        body: payload,
      }
    );
    const second = await requestJson(
      analyzeTransactionsRouteModule.analyzeTransactionsRouter,
      {
        method: "POST",
        path: "/",
        body: payload,
      }
    );

    assert.equal(first.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.wallet, wallet);
    assert.equal(first.body.transactionCount, 5);
    assert.equal(first.body.analyzedAt, "2026-01-31T12:00:00Z");
    assert.deepEqual(
      Object.keys(first.body.categoryBreakdown).sort(),
      Object.values(EmissionCategory).sort()
    );
    assert.equal(
      Number(
        first.body.transactions
          .reduce((sum: number, tx: { co2eGrams: number }) => sum + tx.co2eGrams, 0)
          .toFixed(2)
      ),
      first.body.totalCo2eGrams
    );
  });

  it("POST /api/demo/connect-bank binds preset transactions to the wallet", { skip: "synthetic transaction files not included in repo" }, async () => {
    const wallet = "G".repeat(32);

    const connect = await requestJson(demoConnectBankRouteModule.demoConnectBankRouter, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        mode: "preset",
        scenario: "sustainable",
      },
    });

    assert.equal(connect.status, 200);
    assert.equal(connect.body.wallet, wallet);
    assert.equal(connect.body.mode, "preset");
    assert.equal(connect.body.sourceLabel, "preset:sustainable");
    assert.ok(connect.body.transactionCount >= 1);

    const analysis = await requestJson(
      analyzeTransactionsRouteModule.analyzeTransactionsRouter,
      {
        method: "POST",
        path: "/",
        body: { wallet, limit: 5 },
      }
    );

    assert.equal(analysis.status, 200);
    assert.equal(analysis.body.transactionCount, 5);
    assert.match(analysis.body.transactions[0].transactionId, /^sus_/);
  });

  it("POST /api/demo/connect-bank accepts uploaded transactions for analysis", async () => {
    const wallet = "H".repeat(32);

    const connect = await requestJson(demoConnectBankRouteModule.demoConnectBankRouter, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        mode: "upload",
        transactions: [
          {
            transactionId: "upload_001",
            description: "Electric bike commute pass",
            amountUsd: 34.5,
            mccCode: "4111",
            date: "2026-03-01T10:00:00Z",
          },
          {
            transactionId: "upload_002",
            description: "Local farmers market groceries",
            amountUsd: 56.25,
            mccCode: "5411",
            date: "2026-03-02T10:00:00Z",
          },
        ],
      },
    });

    assert.equal(connect.status, 200);
    assert.equal(connect.body.mode, "upload");
    assert.equal(connect.body.transactionCount, 2);

    const analysis = await requestJson(
      analyzeTransactionsRouteModule.analyzeTransactionsRouter,
      {
        method: "POST",
        path: "/",
        body: { wallet, limit: 20 },
      }
    );

    assert.equal(analysis.status, 200);
    assert.equal(analysis.body.transactionCount, 2);
    assert.equal(analysis.body.transactions[0].transactionId, "upload_001");
    assert.equal(
      analysis.body.transactions[1].description,
      "Local farmers market groceries"
    );
  });

  it("GET /api/green-score computes and stores the integrated score", async () => {
    const wallet = "B".repeat(32);

    const first = await requestJson(greenScoreRouteModule.greenScoreRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    const second = await requestJson(greenScoreRouteModule.greenScoreRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });

    assert.equal(first.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.wallet, wallet);
    assert.ok(first.body.score >= 0 && first.body.score <= 100);
    assert.ok("spendingHabits" in first.body.breakdown);
    assert.ok(!("stakingHistory" in first.body.breakdown));

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
    });
    assert.equal(user.greenScore, first.body.score);
  });

  it("GET /api/swap-suggestions is deterministic and sorted by savings source category", async () => {
    const wallet = "C".repeat(32);

    const first = await requestJson(
      swapSuggestionsRouteModule.swapSuggestionsRouter,
      {
        method: "GET",
        path: `/?wallet=${wallet}`,
      }
    );
    const second = await requestJson(
      swapSuggestionsRouteModule.swapSuggestionsRouter,
      {
        method: "GET",
        path: `/?wallet=${wallet}`,
      }
    );

    assert.equal(first.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.ok(first.body.suggestions.length >= 3);
    assert.ok(first.body.suggestions.length <= 5);
    assert.equal(
      first.body.totalPotentialSavingsMonthly,
      Number(
        first.body.suggestions
          .reduce(
            (sum: number, item: { co2eSavingsMonthly: number }) =>
              sum + item.co2eSavingsMonthly,
            0
          )
          .toFixed(2)
      )
    );
    assert.deepEqual(
      first.body.suggestions.map(
        (item: { currentCo2eMonthly: number }) => item.currentCo2eMonthly
      ),
      [...first.body.suggestions]
        .sort(
          (
            left: { currentCo2eMonthly: number },
            right: { currentCo2eMonthly: number }
          ) => right.currentCo2eMonthly - left.currentCo2eMonthly
        )
        .map((item: { currentCo2eMonthly: number }) => item.currentCo2eMonthly)
    );
  });

  it("GET /api/swap-suggestions backfills filtered categories up to the minimum count", async () => {
    const wallet = "D".repeat(32);
    const response = await requestJson(
      swapSuggestionsRouteModule.swapSuggestionsRouter,
      {
        method: "GET",
        path: `/?wallet=${wallet}&categories=travel&categories=gas_fuel`,
      }
    );

    assert.equal(response.status, 200);
    assert.ok(response.body.suggestions.length >= 3);
    assert.ok(
      ["travel", "gas_fuel"].includes(response.body.suggestions[0].currentCategory)
    );
  });

  it("POST /api/trigger-offset computes a deterministic decision and records through the blockchain handoff", async () => {
    const wallet = "E".repeat(32);
    const router = triggerOffsetRouteModule.createTriggerOffsetRouter({
      processRecordOffset: async () => ({
        status: OffsetStatus.RECORDED_ON_CHAIN,
        toucanTxHash: "0xtoucan123",
      }),
    });

    const first = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        budgetUsd: 10,
      },
    });
    const second = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        budgetUsd: 10,
      },
    });

    assert.equal(first.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.status, OffsetStatus.RECORDED_ON_CHAIN);
    assert.equal(first.body.toucanTxHash, "0xtoucan123");
    assert.equal(
      first.body.decision.costUsd,
      Number(
        (
          (first.body.decision.pricePerTonneUsd * first.body.decision.co2eGrams) /
          1_000_000
        ).toFixed(2)
      )
    );
  });

  it("POST /api/trigger-offset rejects insufficient budgets and fully-offset wallets", async () => {
    const wallet = "F".repeat(32);
    const router = triggerOffsetRouteModule.createTriggerOffsetRouter({
      processRecordOffset: async () => ({
        status: OffsetStatus.RECORDED_ON_CHAIN,
        toucanTxHash: "unused",
      }),
    });

    const tooSmall = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        budgetUsd: 0.000001,
      },
    });
    assert.equal(tooSmall.status, 422);

    const analysis = await requestJson(
      analyzeTransactionsRouteModule.analyzeTransactionsRouter,
      {
        method: "POST",
        path: "/",
        body: { wallet, limit: 20 },
      }
    );
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 0,
      },
    });
    await prismaModule.prisma.impactRecord.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        co2OffsetGrams: analysis.body.totalCo2eGrams,
        creditType: CarbonCreditType.FORESTRY,
        status: OffsetStatus.RECORDED_ON_CHAIN,
      },
    });

    const noneRemaining = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        budgetUsd: 5,
      },
    });
    assert.equal(noneRemaining.status, 422);
  });

  it("POST /api/simulate-stake uses the continuous staking curve", async () => {
    const lowScore = await requestJson(
      simulateStakeRouteModule.simulateStakeRouter,
      {
        method: "POST",
        path: "/",
        body: {
          amount: 100,
          durationDays: 30,
          greenScore: 0,
        },
      }
    );
    const highScore = await requestJson(
      simulateStakeRouteModule.simulateStakeRouter,
      {
        method: "POST",
        path: "/",
        body: {
          amount: 100,
          durationDays: 30,
          greenScore: 100,
        },
      }
    );

    assert.equal(lowScore.status, 200);
    assert.equal(lowScore.body.baseApy, STAKING_BASE_APY);
    assert.equal(lowScore.body.greenBonus, 0);
    assert.equal(lowScore.body.effectiveApy, STAKING_BASE_APY);

    assert.equal(highScore.status, 200);
    assert.equal(highScore.body.greenBonus, STAKING_GREEN_BONUS_MAX);
    assert.equal(
      highScore.body.effectiveApy,
      STAKING_BASE_APY + STAKING_GREEN_BONUS_MAX
    );
  });

  it("POST /api/stake validates input and persists an executed demo stake", async () => {
    const wallet = randomWallet();
    const vaultAddress = Keypair.generate().publicKey;
    const router = stakeRouteModule.createStakeRouter({
      getApiPayer: () => Keypair.generate(),
      getSolanaConnection: () => ({}) as never,
      confirmSolanaSignature: async () => {},
      refreshStoredGreenScore: async () => ({
        wallet,
        score: 82,
        tier: "forest",
        breakdown: {
          transactionEfficiency: 80,
          spendingHabits: 79,
          carbonOffsets: 85,
          communityImpact: 84,
        },
      }),
      getVaultAddress: () => vaultAddress,
      sendStakeTransfer: async () => "stake-sig-123",
    });

    const invalid = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 0,
        durationDays: 30,
      },
    });
    assert.equal(invalid.status, 400);

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 12.5,
        durationDays: 90,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.wallet, wallet);
    assert.equal(response.body.amount, 12.5);
    assert.equal(response.body.durationDays, 90);
    assert.equal(response.body.greenScore, 82);
    assert.equal(response.body.vaultAddress, vaultAddress.toBase58());
    assert.equal(response.body.solanaSignature, "stake-sig-123");
    assert.equal(response.body.status, "confirmed");

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
      include: { stakes: true },
    });
    assert.equal(user.stakes.length, 1);
    assert.equal(user.stakes[0]?.solanaTxHash, "stake-sig-123");
    assert.equal(user.stakes[0]?.vaultAddress, vaultAddress.toBase58());
    assert.equal(user.stakes[0]?.status, "confirmed");
  });

  it("POST /api/stake uses protocol execution output when available", async () => {
    const wallet = randomWallet();
    let transferFallbackCalls = 0;

    const router = stakeRouteModule.createStakeRouter({
      getApiPayer: () => Keypair.generate(),
      getSolanaConnection: () => ({}) as never,
      confirmSolanaSignature: async () => {},
      refreshStoredGreenScore: async () => ({
        wallet,
        score: 74,
        tier: "tree",
        breakdown: {
          transactionEfficiency: 70,
          spendingHabits: 72,
          carbonOffsets: 76,
          communityImpact: 78,
        },
      }),
      getVaultAddress: () => Keypair.generate().publicKey,
      sendStakeTransfer: async () => {
        transferFallbackCalls += 1;
        return "should-not-be-used";
      },
      executeProtocolStake: async () => ({
        provider: "marinade",
        solanaSignature: "marinade-sig-abc",
        destinationAddress: Keypair.generate().publicKey.toBase58(),
      }),
    });

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 3.2,
        durationDays: 45,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.wallet, wallet);
    assert.equal(response.body.solanaSignature, "marinade-sig-abc");
    assert.equal(transferFallbackCalls, 0);

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
      include: { stakes: true },
    });
    assert.equal(user.stakes.length, 1);
    assert.equal(user.stakes[0]?.solanaTxHash, "marinade-sig-abc");
    assert.equal(user.stakes[0]?.status, "confirmed");
  });

  it("POST /api/stake accepts wallet-signed staking signatures", async () => {
    const wallet = randomWallet();
    const vaultAddress = Keypair.generate().publicKey;
    let transferCalls = 0;

    const router = stakeRouteModule.createStakeRouter({
      getApiPayer: () => Keypair.generate(),
      getSolanaConnection: () => ({}) as never,
      confirmSolanaSignature: async () => {},
      refreshStoredGreenScore: async () => ({
        wallet,
        score: 68,
        tier: "tree",
        breakdown: {
          transactionEfficiency: 66,
          spendingHabits: 64,
          carbonOffsets: 70,
          communityImpact: 72,
        },
      }),
      getVaultAddress: () => vaultAddress,
      sendStakeTransfer: async () => {
        transferCalls += 1;
        return "should-not-be-used";
      },
      verifyWalletStakeSignature: async ({ signature }) => {
        assert.equal(signature, "user-wallet-sig-999");
        return vaultAddress.toBase58();
      },
    });

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 2.4,
        durationDays: 30,
        solanaSignature: "user-wallet-sig-999",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.solanaSignature, "user-wallet-sig-999");
    assert.equal(response.body.vaultAddress, vaultAddress.toBase58());
    assert.equal(transferCalls, 0);

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
      include: { stakes: true },
    });
    assert.equal(user.stakes.length, 1);
    assert.equal(user.stakes[0]?.solanaTxHash, "user-wallet-sig-999");
    assert.equal(user.stakes[0]?.vaultAddress, vaultAddress.toBase58());
  });

  it("GET /api/staking-info creates a new user and aggregates only executed stake data", async () => {
    const wallet = randomWallet();
    let response = await requestJson(stakingInfoRouteModule.stakingInfoRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.wallet, wallet);
    assert.equal(response.body.greenScore, 0);
    assert.equal(response.body.stakedAmount, 0);
    assert.equal(response.body.accruedYield, 0);

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
    });
    await prismaModule.prisma.stakeRecord.createMany({
      data: [
        {
          userId: user.id,
          walletAddress: wallet,
          amount: 10,
          durationDays: 30,
          greenScore: 0,
          effectiveApy: 6.5,
          estimatedYield: 0.53,
          solanaTxHash: "stake-executed-1",
          vaultAddress: randomWallet(),
          status: "confirmed",
        },
        {
          userId: user.id,
          walletAddress: wallet,
          amount: 5,
          durationDays: 60,
          greenScore: 0,
          effectiveApy: 6.5,
          estimatedYield: 0.21,
          solanaTxHash: "stake-executed-2",
          vaultAddress: randomWallet(),
          status: "confirmed",
        },
        {
          userId: user.id,
          walletAddress: wallet,
          amount: 99,
          durationDays: 365,
          greenScore: 0,
          effectiveApy: 6.5,
          estimatedYield: 99,
          status: "simulated",
        },
      ],
    });

    response = await requestJson(stakingInfoRouteModule.stakingInfoRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.stakedAmount, 15);
    assert.equal(response.body.accruedYield, 0.74);
  });

  it("GET /api/leaderboard paginates and sorts by score descending", async () => {
    const firstUser = await prismaModule.prisma.user.create({
      data: {
        walletAddress: randomWallet(),
        greenScore: 95,
      },
    });
    const secondUser = await prismaModule.prisma.user.create({
      data: {
        walletAddress: randomWallet(),
        greenScore: 72,
      },
    });

    await prismaModule.prisma.impactRecord.createMany({
      data: [
        {
          userId: firstUser.id,
          walletAddress: firstUser.walletAddress,
          co2OffsetGrams: 8_000,
          creditType: CarbonCreditType.FORESTRY,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
        {
          userId: secondUser.id,
          walletAddress: secondUser.walletAddress,
          co2OffsetGrams: 4_000,
          creditType: CarbonCreditType.SOIL_CARBON,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
      ],
    });

    const response = await requestJson(leaderboardRouteModule.leaderboardRouter, {
      method: "GET",
      path: "/?page=1&pageSize=1",
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.totalEntries, 2);
    assert.equal(response.body.totalPages, 2);
    assert.equal(response.body.entries.length, 1);
    assert.equal(response.body.entries[0].wallet, firstUser.walletAddress);
    assert.equal(response.body.entries[0].score, 95);
    assert.equal(response.body.entries[0].totalCo2eOffset, 8_000);
  });

  it("GET /api/nft-metadata returns 404 for an unknown wallet and metadata for a known one", async () => {
    const unknownWallet = randomWallet();

    const notFound = await requestJson(nftMetadataRouteModule.nftMetadataRouter, {
      method: "GET",
      path: `/?wallet=${unknownWallet}`,
    });
    assert.equal(notFound.status, 404);

    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 76,
      },
    });
    await prismaModule.prisma.impactRecord.createMany({
      data: [
        {
          userId: user.id,
          walletAddress: wallet,
          co2OffsetGrams: 5_000,
          creditType: CarbonCreditType.FORESTRY,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
        {
          userId: user.id,
          walletAddress: wallet,
          co2OffsetGrams: 2_000,
          creditType: CarbonCreditType.FORESTRY,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
      ],
    });

    const response = await requestJson(nftMetadataRouteModule.nftMetadataRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.symbol, "CIQNFT");
    assert.equal(response.body.properties.creators[0].address, wallet);
    assert.match(response.body.description, /7,000g CO2 offset/);
  });

  it("POST /api/record-offset records a first on-chain proof and refreshes the stored green score", async () => {
    const proofPda = Keypair.generate().publicKey;
    const router = recordOffsetRouteModule.createRecordOffsetRouter({
      recordImpact: async () => ({
        signature: "sig-create",
        proofOfImpactAddress: proofPda.toBase58(),
      }),
      updateImpact: async () => {
        throw new Error("updateImpact should not be called");
      },
      creditTypeToIndex: () => 1,
      getProofOfImpact: async () => null,
      getProofOfImpactPda: () => proofPda,
      mockRetireCarbonCredits: async () => ({
        toucanTxHash: "0xabc123",
        retiredAt: new Date().toISOString(),
        projectName: "Amazon Rainforest Conservation - Brazil",
        creditType: CarbonCreditType.FORESTRY,
        co2eGrams: 5_000,
      }),
      getProjectForCreditType: () => "Amazon Rainforest Conservation - Brazil",
      refreshStoredGreenScore: greenScoreServiceModule.refreshStoredGreenScore,
    });
    const wallet = randomWallet();

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        co2eGrams: 5_000,
        creditType: CarbonCreditType.FORESTRY,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.solanaSignature, "sig-create");
    assert.equal(response.body.proofOfImpactAddress, proofPda.toBase58());
    assert.equal(response.body.cumulativeCo2eGrams, 5_000);

    const user = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
    });
    const impacts = await prismaModule.prisma.impactRecord.findMany({
      where: { userId: user.id },
    });
    const refreshed = await greenScoreServiceModule.refreshStoredGreenScore(wallet);

    assert.equal(user.greenScore, refreshed.score);
    assert.ok(user.greenScore > 0);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0]?.status, OffsetStatus.RECORDED_ON_CHAIN);
    assert.equal(impacts[0]?.creditType, CarbonCreditType.FORESTRY);
  });

  it("POST /api/record-offset updates an existing proof and rejects invalid credit types", async () => {
    const proofPda = new PublicKey("99ZkMZawmHYwNPyQzseCbEbJFs6mxEYyhJrwdYGadCsR");
    const router = recordOffsetRouteModule.createRecordOffsetRouter({
      recordImpact: async () => {
        throw new Error("recordImpact should not be called");
      },
      updateImpact: async () => ({
        signature: "sig-update",
        cumulativeCo2eGrams: 9_000,
      }),
      creditTypeToIndex: () => 4,
      getProofOfImpact: async () => ({
        co2OffsetAmount: 4_000,
        creditType: 1,
        timestamp: Date.now(),
      }),
      getProofOfImpactPda: () => proofPda,
      mockRetireCarbonCredits: async () => ({
        toucanTxHash: "0xdef456",
        retiredAt: new Date().toISOString(),
        projectName: "Regenerative Agriculture - Kenya",
        creditType: CarbonCreditType.SOIL_CARBON,
        co2eGrams: 5_000,
      }),
      getProjectForCreditType: () => "Regenerative Agriculture - Kenya",
      refreshStoredGreenScore: greenScoreServiceModule.refreshStoredGreenScore,
    });
    const wallet = randomWallet();

    const valid = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        co2eGrams: 5_000,
        creditType: CarbonCreditType.SOIL_CARBON,
      },
    });
    const invalid = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        co2eGrams: 5_000,
        creditType: "bad_credit_type",
      },
    });

    assert.equal(valid.status, 200);
    assert.equal(valid.body.solanaSignature, "sig-update");
    assert.equal(valid.body.cumulativeCo2eGrams, 9_000);
    assert.equal(valid.body.proofOfImpactAddress, proofPda.toBase58());

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error, "Validation error");
  });
});
