import "dotenv/config";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function normalizeSqliteUrl(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }

  if (url.startsWith("file:./") || url.startsWith("file:../")) {
    const filePath = url.slice("file:".length);
    return `file:${path.resolve(process.cwd(), filePath)}`;
  }

  return url;
}

process.env.DATABASE_URL = normalizeSqliteUrl(process.env.DATABASE_URL);

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
