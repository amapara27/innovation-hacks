import { prisma } from "./prisma.js";

let ensured = false;

export async function ensureDatabaseSchema(): Promise<void> {
  if (ensured) {
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "walletAddress" TEXT NOT NULL,
      "greenScore" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_walletAddress_key"
    ON "User"("walletAddress")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TransactionAnalysis" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "signature" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "computeUnits" INTEGER NOT NULL,
      "estimatedCO2" REAL NOT NULL,
      "transactionType" TEXT NOT NULL,
      "analyzedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TransactionAnalysis_signature_key"
    ON "TransactionAnalysis"("signature")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ImpactRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "co2OffsetGrams" INTEGER NOT NULL,
      "creditType" TEXT NOT NULL DEFAULT 'forestry',
      "toucanTxHash" TEXT,
      "onChainTxHash" TEXT,
      "proofPda" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StakeRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "amount" REAL NOT NULL,
      "durationDays" INTEGER NOT NULL,
      "greenScore" INTEGER NOT NULL,
      "effectiveApy" REAL NOT NULL,
      "estimatedYield" REAL NOT NULL,
      "simulatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);

  ensured = true;
}
