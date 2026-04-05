import assert from "node:assert/strict";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { type Router } from "express";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  CarbonCreditType,
  OffsetStatus,
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), "prisma/test.db")}`;

type PrismaModule = typeof import("../src/lib/prisma.js");
type EnsureDatabaseModule = typeof import("../src/lib/ensureDatabase.js");
type SimulateStakeRouteModule = typeof import("../src/routes/simulateStake.js");
type StakingInfoRouteModule = typeof import("../src/routes/stakingInfo.js");
type LeaderboardRouteModule = typeof import("../src/routes/leaderboard.js");
type NftMetadataRouteModule = typeof import("../src/routes/nftMetadata.js");
type RecordOffsetRouteModule = typeof import("../src/routes/recordOffset.js");

let prismaModule: PrismaModule;
let ensureDatabaseModule: EnsureDatabaseModule;
let simulateStakeRouteModule: SimulateStakeRouteModule;
let stakingInfoRouteModule: StakingInfoRouteModule;
let leaderboardRouteModule: LeaderboardRouteModule;
let nftMetadataRouteModule: NftMetadataRouteModule;
let recordOffsetRouteModule: RecordOffsetRouteModule;

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
        query: Object.fromEntries(url.searchParams.entries()),
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

  return {
    status: response.status,
    body: response.body,
  };
}

function randomWallet(): string {
  return Keypair.generate().publicKey.toBase58();
}

before(async () => {
  prismaModule = await import("../src/lib/prisma.js");
  ensureDatabaseModule = await import("../src/lib/ensureDatabase.js");
  await ensureDatabaseModule.ensureDatabaseSchema();
  simulateStakeRouteModule = await import("../src/routes/simulateStake.js");
  stakingInfoRouteModule = await import("../src/routes/stakingInfo.js");
  leaderboardRouteModule = await import("../src/routes/leaderboard.js");
  nftMetadataRouteModule = await import("../src/routes/nftMetadata.js");
  recordOffsetRouteModule = await import("../src/routes/recordOffset.js");
});

beforeEach(async () => {
  await prismaModule.prisma.impactRecord.deleteMany();
  await prismaModule.prisma.stakeRecord.deleteMany();
  await prismaModule.prisma.transactionAnalysis.deleteMany();
  await prismaModule.prisma.user.deleteMany();
});

after(async () => {
  await prismaModule.prisma.$disconnect();
});

describe("blockchain backend routes", () => {
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

  it("GET /api/staking-info creates a new user and aggregates stake data", async () => {
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
          amount: 10,
          durationDays: 30,
          greenScore: 0,
          effectiveApy: 6.5,
          estimatedYield: 0.53,
        },
        {
          userId: user.id,
          amount: 5,
          durationDays: 60,
          greenScore: 0,
          effectiveApy: 6.5,
          estimatedYield: 0.21,
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
          co2OffsetGrams: 8_000,
          creditType: CarbonCreditType.FORESTRY,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
        {
          userId: secondUser.id,
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
          co2OffsetGrams: 5_000,
          creditType: CarbonCreditType.FORESTRY,
          status: OffsetStatus.RECORDED_ON_CHAIN,
        },
        {
          userId: user.id,
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

  it("POST /api/record-offset records a first on-chain proof with mocked Solana deps", async () => {
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

    assert.equal(user.greenScore, 5);
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
