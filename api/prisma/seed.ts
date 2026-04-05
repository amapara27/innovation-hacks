/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  Prisma Seed Script                                                     ║
 * ║  Seeds the database with mock users and impact records for demo.        ║
 * ║  Run: npx tsx prisma/seed.ts                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { PrismaClient } from "@prisma/client";
import { Keypair } from "@solana/web3.js";
import {
  CarbonCreditType,
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";

const prisma = new PrismaClient();

const CREDIT_TYPES = [
  CarbonCreditType.RENEWABLE_ENERGY,
  CarbonCreditType.FORESTRY,
  CarbonCreditType.METHANE_CAPTURE,
  CarbonCreditType.DIRECT_AIR_CAPTURE,
  CarbonCreditType.SOIL_CARBON,
  CarbonCreditType.OCEAN_BASED,
] as const;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a weighted random green score.
 * Most users cluster around 30–70, with tails on both ends.
 */
function randomGreenScore(): number {
  // Use a simple normal-ish distribution
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  return Math.round(r * 100);
}

async function main() {
  console.log("🌱 Seeding CarbonIQ database...\n");

  // Clear existing data
  await prisma.impactRecord.deleteMany();
  await prisma.stakeRecord.deleteMany();
  await prisma.transactionAnalysis.deleteMany();
  await prisma.user.deleteMany();

  const userCount = 50;
  let totalImpacts = 0;

  for (let i = 0; i < userCount; i++) {
    // Generate a real Solana wallet address
    const wallet = Keypair.generate().publicKey.toBase58();
    const greenScore = randomGreenScore();

    const user = await prisma.user.create({
      data: {
        walletAddress: wallet,
        greenScore,
      },
    });

    // Create 1–5 impact records per user
    const impactCount = randomInt(1, 5);
    for (let j = 0; j < impactCount; j++) {
      await prisma.impactRecord.create({
        data: {
          userId: user.id,
          co2OffsetGrams: randomInt(500, 50000),
          creditType: randomChoice(CREDIT_TYPES),
          status: "recorded_on_chain",
          toucanTxHash:
            "0x" +
            Array.from({ length: 64 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join(""),
          onChainTxHash: Keypair.generate().publicKey.toBase58(), // mock sig
          proofPda: Keypair.generate().publicKey.toBase58(),
        },
      });
      totalImpacts++;
    }

    // Create 0–2 stake simulation records
    const stakeCount = randomInt(0, 2);
    for (let k = 0; k < stakeCount; k++) {
      const amount = randomInt(1, 500);
      const days = randomInt(7, 365);
      const apy =
        STAKING_BASE_APY +
        STAKING_GREEN_BONUS_MAX * Math.pow(greenScore / 100, 1.5);
      const yield_ = amount * (apy / 100) * (days / 365);

      await prisma.stakeRecord.create({
        data: {
          userId: user.id,
          amount,
          durationDays: days,
          greenScore,
          effectiveApy: parseFloat(apy.toFixed(4)),
          estimatedYield: parseFloat(yield_.toFixed(6)),
        },
      });
    }

    const tier =
      greenScore >= 90
        ? "🌍 Earth Guardian"
        : greenScore >= 75
          ? "🌲 Forest"
          : greenScore >= 50
            ? "🌳 Tree"
            : greenScore >= 25
              ? "🌱 Sprout"
              : "🌰 Seedling";

    console.log(
      `  User ${(i + 1).toString().padStart(2)}: ${wallet.slice(0, 8)}… | Score: ${greenScore.toString().padStart(3)} ${tier} | ${impactCount} impacts`
    );
  }

  console.log(`\n✅ Seeded ${userCount} users with ${totalImpacts} impact records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
