import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Router } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  CarbonCreditType,
  EmissionCategory,
  OffsetStatus,
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";

const testDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(testDir, "../.env") });

process.env.NODE_ENV = "test";

const testDatabaseUrl = [
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
  process.env.MONGODB_URI,
].find((value) => value?.trim());
if (!testDatabaseUrl) {
  throw new Error(
    "Set TEST_DATABASE_URL, DATABASE_URL, or MONGODB_URI before running API tests against MongoDB."
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
type SimulateStakeTimelineRouteModule = typeof import(
  "../src/routes/simulateStakeTimeline.js"
);
type StakeRouteModule = typeof import("../src/routes/stake.js");
type StakeCollectRouteModule = typeof import("../src/routes/stakeCollect.js");
type StakeWithdrawRouteModule = typeof import("../src/routes/stakeWithdraw.js");
type StakingInfoRouteModule = typeof import("../src/routes/stakingInfo.js");
type LeaderboardRouteModule = typeof import("../src/routes/leaderboard.js");
type WalletStateRouteModule = typeof import("../src/routes/walletState.js");
type RecommendationActionsRouteModule = typeof import("../src/routes/recommendationActions.js");
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
let simulateStakeTimelineRouteModule: SimulateStakeTimelineRouteModule;
let stakeRouteModule: StakeRouteModule;
let stakeCollectRouteModule: StakeCollectRouteModule;
let stakeWithdrawRouteModule: StakeWithdrawRouteModule;
let stakingInfoRouteModule: StakingInfoRouteModule;
let leaderboardRouteModule: LeaderboardRouteModule;
let walletStateRouteModule: WalletStateRouteModule;
let recommendationActionsRouteModule: RecommendationActionsRouteModule;
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
  simulateStakeTimelineRouteModule = await import(
    "../src/routes/simulateStakeTimeline.js"
  );
  stakeRouteModule = await import("../src/routes/stake.js");
  stakeCollectRouteModule = await import("../src/routes/stakeCollect.js");
  stakeWithdrawRouteModule = await import("../src/routes/stakeWithdraw.js");
  stakingInfoRouteModule = await import("../src/routes/stakingInfo.js");
  leaderboardRouteModule = await import("../src/routes/leaderboard.js");
  walletStateRouteModule = await import("../src/routes/walletState.js");
  recommendationActionsRouteModule = await import(
    "../src/routes/recommendationActions.js"
  );
  nftMetadataRouteModule = await import("../src/routes/nftMetadata.js");
  recordOffsetRouteModule = await import("../src/routes/recordOffset.js");
  greenScoreServiceModule = await import("../src/services/greenScoreService.js");
});

beforeEach(async () => {
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

  it("POST /api/stake/collect succeeds with vault settlement and records a negative yield adjustment", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 78,
        stakingEffectiveApy: 7.2,
      },
    });

    await prismaModule.prisma.stakeRecord.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        amount: 6,
        durationDays: 45,
        greenScore: 78,
        effectiveApy: 7.2,
        estimatedYield: 1.25,
        solanaTxHash: "stake-base-collect-1",
        vaultAddress: randomWallet(),
        status: "confirmed",
        provider: "demo",
      },
    });

    const router = stakeCollectRouteModule.createStakeCollectRouter({
      settlePayout: async () => ({
        settlementSource: "vault_onchain",
        solanaSignature: "collect-vault-sig-1",
        explorerUrl:
          "https://explorer.solana.com/tx/collect-vault-sig-1?cluster=devnet",
        sourceAddress: randomWallet(),
      }),
      getProtocolBaseApy: async () => STAKING_BASE_APY,
    });

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: { wallet },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.settlementSource, "vault_onchain");
    assert.equal(response.body.solanaSignature, "collect-vault-sig-1");
    assert.equal(response.body.collectedAmount, 1.25);
    assert.equal(response.body.remainingAccruedYield, 0);

    const refreshed = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
      include: { stakes: true },
    });
    assert.equal(refreshed.stakes.length, 2);
    const collectAdjustment = refreshed.stakes.find((row) =>
      row.provider.startsWith("collect_")
    );
    assert.equal(collectAdjustment?.provider, "collect_vault_onchain");
    assert.equal(collectAdjustment?.estimatedYield, -1.25);
    assert.equal(collectAdjustment?.amount, 0);
  });

  it("POST /api/stake/collect falls back to API payer settlement when vault path fails", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 66,
        stakingEffectiveApy: 6.9,
      },
    });
    await prismaModule.prisma.stakeRecord.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        amount: 4,
        durationDays: 30,
        greenScore: 66,
        effectiveApy: 6.9,
        estimatedYield: 0.4,
        solanaTxHash: "stake-base-collect-2",
        vaultAddress: randomWallet(),
        status: "confirmed",
        provider: "demo",
      },
    });

    const fallbackTrace: string[] = [];
    const router = stakeCollectRouteModule.createStakeCollectRouter({
      settlePayout: async () => {
        fallbackTrace.push("vault_failed");
        fallbackTrace.push("api_payer_success");
        return {
          settlementSource: "api_payer_onchain",
          solanaSignature: "collect-api-sig-2",
          explorerUrl:
            "https://explorer.solana.com/tx/collect-api-sig-2?cluster=devnet",
          sourceAddress: randomWallet(),
        };
      },
      getProtocolBaseApy: async () => STAKING_BASE_APY,
    });

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: { wallet },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.settlementSource, "api_payer_onchain");
    assert.equal(response.body.solanaSignature, "collect-api-sig-2");
    assert.deepEqual(fallbackTrace, ["vault_failed", "api_payer_success"]);
  });

  it("POST /api/stake/collect falls back to demo accounting when on-chain settlement paths fail", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 54,
        stakingEffectiveApy: 6.7,
      },
    });
    await prismaModule.prisma.stakeRecord.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        amount: 5,
        durationDays: 30,
        greenScore: 54,
        effectiveApy: 6.7,
        estimatedYield: 0.35,
        solanaTxHash: "stake-base-collect-3",
        vaultAddress: randomWallet(),
        status: "confirmed",
        provider: "demo",
      },
    });

    const router = stakeCollectRouteModule.createStakeCollectRouter({
      settlePayout: async () => ({
        settlementSource: "demo_accounting",
      }),
      getProtocolBaseApy: async () => STAKING_BASE_APY,
    });

    const response = await requestJson(router, {
      method: "POST",
      path: "/",
      body: { wallet },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.settlementSource, "demo_accounting");
    assert.equal(response.body.solanaSignature, undefined);
    assert.equal(response.body.remainingAccruedYield, 0);
  });

  it("POST /api/stake/withdraw rejects over-withdraw and updates remaining principal", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 72,
        stakingEffectiveApy: 7.1,
      },
    });
    await prismaModule.prisma.stakeRecord.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        amount: 3,
        durationDays: 45,
        greenScore: 72,
        effectiveApy: 7.1,
        estimatedYield: 0.2,
        solanaTxHash: "stake-base-withdraw-1",
        vaultAddress: randomWallet(),
        status: "confirmed",
        provider: "demo",
      },
    });

    const router = stakeWithdrawRouteModule.createStakeWithdrawRouter({
      settlePayout: async () => ({
        settlementSource: "demo_accounting",
      }),
      getProtocolBaseApy: async () => STAKING_BASE_APY,
    });

    const tooLarge = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 4,
      },
    });
    assert.equal(tooLarge.status, 422);

    const ok = await requestJson(router, {
      method: "POST",
      path: "/",
      body: {
        wallet,
        amount: 1.25,
      },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.withdrawnAmount, 1.25);
    assert.equal(ok.body.remainingStakedAmount, 1.75);

    const refreshed = await prismaModule.prisma.user.findUniqueOrThrow({
      where: { walletAddress: wallet },
      include: { stakes: true },
    });
    const withdrawAdjustment = refreshed.stakes.find((row) =>
      row.provider.startsWith("withdraw_")
    );
    assert.equal(withdrawAdjustment?.amount, -1.25);
    assert.equal(withdrawAdjustment?.estimatedYield, 0);
  });

  it("POST /api/simulate-stake-timeline emits soft decay and hard reset events for sustained low scores", async () => {
    const response = await requestJson(
      simulateStakeTimelineRouteModule.simulateStakeTimelineRouter,
      {
        method: "POST",
        path: "/",
        body: {
          principal: 10,
          currentAccruedYield: 0.5,
          greenScore: 20,
          horizonDays: 20,
        },
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.horizonDays, 20);
    assert.ok(response.body.projectedAccruedYield <= response.body.baselineAccruedYield);
    assert.ok(response.body.earningsDelta <= 0);
    assert.deepEqual(
      response.body.events.map((event: { type: string }) => event.type),
      ["soft_decay_started", "hard_reset_triggered"]
    );
    const day14 = response.body.points.find(
      (point: { day: number }) => point.day === 14
    );
    assert.equal(day14?.projectedAccruedYield, 0);
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

  it("GET /api/staking-info reflects collect and withdraw adjustments in principal and accrued yield", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 63,
      },
    });

    await prismaModule.prisma.stakeRecord.createMany({
      data: [
        {
          userId: user.id,
          walletAddress: wallet,
          amount: 5,
          durationDays: 30,
          greenScore: 63,
          effectiveApy: 6.8,
          estimatedYield: 1.0,
          solanaTxHash: "stake-adjust-base-1",
          vaultAddress: randomWallet(),
          status: "confirmed",
          provider: "demo",
        },
        {
          userId: user.id,
          walletAddress: wallet,
          amount: 0,
          durationDays: 0,
          greenScore: 63,
          effectiveApy: 6.8,
          estimatedYield: -0.4,
          status: "confirmed",
          provider: "collect_demo_accounting",
        },
        {
          userId: user.id,
          walletAddress: wallet,
          amount: -1.5,
          durationDays: 0,
          greenScore: 63,
          effectiveApy: 6.8,
          estimatedYield: 0,
          status: "confirmed",
          provider: "withdraw_demo_accounting",
        },
      ],
    });

    const response = await requestJson(stakingInfoRouteModule.stakingInfoRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.stakedAmount, 3.5);
    assert.equal(response.body.accruedYield, 0.6);
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
    assert.equal(response.body.totalEntries, 25);
    assert.equal(response.body.totalPages, 25);
    assert.equal(response.body.entries.length, 1);
    assert.equal(response.body.entries[0].wallet, firstUser.walletAddress);
    assert.equal(response.body.entries[0].score, 95);
    assert.equal(response.body.entries[0].totalCo2eOffset, 8_000);
  });

  it("GET /api/wallet-state rehydrates uploaded analysis, score, staking, and saved recommendations", async () => {
    const wallet = randomWallet();
    const uploadedAt = new Date("2026-04-05T10:15:00.000Z");
    const sourceLabel = `upload:${uploadedAt.toISOString()}`;
    const suggestionKey = "groceries::current::swap";
    const user = await prismaModule.prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore: 84,
        breakdownTransactionEfficiency: 88,
        breakdownSpendingHabits: 82,
        breakdownCarbonOffsets: 14,
        breakdownCommunityImpact: 9,
        stakingBaseApy: STAKING_BASE_APY,
        stakingGreenBonus: 1.25,
        stakingEffectiveApy: STAKING_BASE_APY + 1.25,
        stakingStakedAmount: 3.5,
        stakeVaultAddress: randomWallet(),
        latestUploadAt: uploadedAt,
        latestUploadSourceLabel: sourceLabel,
      },
    });

    await prismaModule.prisma.transaction.upsert({
      where: {
        walletAddress_transactionId: {
          walletAddress: wallet,
          transactionId: "upload_1",
        },
      },
      create: {
        walletAddress: wallet,
        transactionId: "upload_1",
        description: "Whole Foods",
        amountUsd: 84.12,
        mccCode: "5411",
        category: EmissionCategory.GROCERIES,
        co2eGrams: 640,
        emissionFactor: 0.0076,
        date: new Date("2026-04-04T12:00:00.000Z"),
        sourceLabel,
        analyzedAt: uploadedAt,
      },
      update: {},
    });
    await prismaModule.prisma.transaction.upsert({
      where: {
        walletAddress_transactionId: {
          walletAddress: wallet,
          transactionId: "upload_2",
        },
      },
      create: {
        walletAddress: wallet,
        transactionId: "upload_2",
        description: "Dr. Bronner's Soap",
        amountUsd: 19.49,
        mccCode: "5999",
        category: EmissionCategory.HEALTH,
        co2eGrams: 210,
        emissionFactor: 0.0108,
        date: new Date("2026-04-03T12:00:00.000Z"),
        sourceLabel,
        analyzedAt: uploadedAt,
      },
      update: {},
    });

    const recommendationRun = await prismaModule.prisma.recommendationRun.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        categoriesRequested: [EmissionCategory.GROCERIES],
        suggestions: [
          {
            currentCategory: EmissionCategory.GROCERIES,
            currentDescription: "Name-brand oat milk",
            currentCo2eMonthly: 1_220,
            alternativeDescription: "Store-brand oat milk",
            alternativeCo2eMonthly: 720,
            co2eSavingsMonthly: 500,
            priceDifferenceUsd: -1.15,
            difficulty: "easy",
          },
        ],
        totalPotentialSavingsMonthly: 500,
        narratorProvider: "openai",
        model: "gpt-5.4-mini",
        promptHash: "wallet-state-test",
        createdAt: uploadedAt,
      },
    });

    await prismaModule.prisma.recommendationAction.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        recommendationRunId: recommendationRun.id,
        suggestionKey,
        action: "adopted",
        actedAt: uploadedAt,
      },
    });

    const response = await requestJson(walletStateRouteModule.walletStateRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.wallet, wallet);
    assert.equal(response.body.hasUploadedTransactions, true);
    assert.equal(response.body.latestUploadAt, uploadedAt.toISOString());
    assert.equal(response.body.analysis?.transactionCount, 2);
    assert.equal(response.body.analysis?.totalCo2eGrams, 850);
    assert.equal(response.body.greenScore?.score, 84);
    assert.equal(response.body.stakingInfo?.stakedAmount, 3.5);
    assert.equal(response.body.latestRecommendations?.suggestions.length, 1);
    assert.deepEqual(response.body.adoptedSuggestionKeys, [suggestionKey]);
  });

  it("POST /api/recommendation-actions persists adopted and cleared swap state", async () => {
    const wallet = randomWallet();
    const user = await prismaModule.prisma.user.create({
      data: { walletAddress: wallet, greenScore: 71 },
    });
    await prismaModule.prisma.recommendationRun.create({
      data: {
        userId: user.id,
        walletAddress: wallet,
        categoriesRequested: [EmissionCategory.GROCERIES],
        suggestions: [
          {
            currentCategory: EmissionCategory.GROCERIES,
            currentDescription: "Brand-name granola",
            currentCo2eMonthly: 980,
            alternativeDescription: "Bulk-bin granola",
            alternativeCo2eMonthly: 520,
            co2eSavingsMonthly: 460,
            priceDifferenceUsd: -0.85,
            difficulty: "easy",
          },
        ],
        totalPotentialSavingsMonthly: 460,
        narratorProvider: "openai",
        model: "gpt-5.4-mini",
        promptHash: "recommendation-action-test",
      },
    });

    const adoptedResponse = await requestJson(
      recommendationActionsRouteModule.recommendationActionsRouter,
      {
        method: "POST",
        path: "/",
        body: {
          wallet,
          suggestionKey: "groceries::adopt-me",
          action: "adopted",
        },
      }
    );

    assert.equal(adoptedResponse.status, 200);
    assert.equal(adoptedResponse.body.action, "adopted");

    const adoptedState = await requestJson(walletStateRouteModule.walletStateRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    assert.deepEqual(adoptedState.body.adoptedSuggestionKeys, [
      "groceries::adopt-me",
    ]);

    const clearedResponse = await requestJson(
      recommendationActionsRouteModule.recommendationActionsRouter,
      {
        method: "POST",
        path: "/",
        body: {
          wallet,
          suggestionKey: "groceries::adopt-me",
          action: "cleared",
        },
      }
    );

    assert.equal(clearedResponse.status, 200);
    assert.equal(clearedResponse.body.action, "cleared");

    const clearedState = await requestJson(walletStateRouteModule.walletStateRouter, {
      method: "GET",
      path: `/?wallet=${wallet}`,
    });
    assert.deepEqual(clearedState.body.adoptedSuggestionKeys, []);
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
