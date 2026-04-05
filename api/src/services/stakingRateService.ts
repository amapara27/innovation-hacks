import { STAKING_BASE_APY } from "@carboniq/contracts";
import { Marinade, MarinadeConfig } from "@marinade.finance/marinade-ts-sdk";
import { prisma } from "../lib/prisma.js";
import { getSolanaConnection } from "./solanaService.js";

const PROTOCOL = "marinade";
const METRIC = "msol_price";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 14;
const MIN_WINDOW_DAYS = 1;
// Hardcoded fallback informed by public Marinade pool stats
// (Solana Compass listed Marinade current APY as 6.10% on April 5, 2026).
const MARINADE_WEB_FALLBACK_APY = 6.1;

let cachedBaseApy: { value: number; expiresAt: number } | null = null;

type RateSnapshotRow = {
  value: number;
  capturedAt: Date;
};

function parseWindowDays(): number {
  const raw = Number(process.env.STAKING_PROTOCOL_APY_WINDOW_DAYS ?? DEFAULT_WINDOW_DAYS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_WINDOW_DAYS;
  }
  return Math.max(MIN_WINDOW_DAYS, Math.floor(raw));
}

function clampApy(input: number): number {
  if (!Number.isFinite(input)) {
    return STAKING_BASE_APY;
  }

  // Guardrail against malformed snapshots or sudden outliers.
  return Math.max(0, Math.min(50, input));
}

function getHardcodedBaseApy(): number {
  const configured = Number(process.env.MARINADE_HARDCODED_APY ?? MARINADE_WEB_FALLBACK_APY);
  if (!Number.isFinite(configured)) {
    return MARINADE_WEB_FALLBACK_APY;
  }
  return clampApy(configured);
}

async function fetchCurrentMarinadeMsolPrice(): Promise<number> {
  const marinade = new Marinade(
    new MarinadeConfig({
      connection: getSolanaConnection(),
      publicKey: null,
    })
  );

  const state = await marinade.getMarinadeState();
  return state.mSolPrice;
}

async function insertSnapshot(value: number): Promise<void> {
  await prisma.protocolRateSnapshot.create({
    data: {
      provider: PROTOCOL,
      metric: METRIC,
      value,
    },
  });
}

async function getPreviousSnapshot(cutoff: Date): Promise<RateSnapshotRow | null> {
  return prisma.protocolRateSnapshot.findFirst({
    where: {
      provider: PROTOCOL,
      metric: METRIC,
      capturedAt: { lte: cutoff },
    },
    orderBy: { capturedAt: "desc" },
    select: { value: true, capturedAt: true },
  });
}

function computeAnnualizedApy({
  currentPrice,
  previousPrice,
  elapsedMs,
}: {
  currentPrice: number;
  previousPrice: number;
  elapsedMs: number;
}): number {
  if (currentPrice <= 0 || previousPrice <= 0 || elapsedMs <= 0) {
    return STAKING_BASE_APY;
  }

  const days = elapsedMs / (1000 * 60 * 60 * 24);
  if (days <= 0) {
    return STAKING_BASE_APY;
  }

  const growth = currentPrice / previousPrice;
  const annualized = (Math.pow(growth, 365 / days) - 1) * 100;
  return clampApy(annualized);
}

export async function getProtocolBaseApy(): Promise<number> {
  if (process.env.NODE_ENV === "test") {
    return STAKING_BASE_APY;
  }

  const now = Date.now();
  if (cachedBaseApy && cachedBaseApy.expiresAt > now) {
    return cachedBaseApy.value;
  }

  try {
    const currentPrice = await fetchCurrentMarinadeMsolPrice();
    await insertSnapshot(currentPrice);

    const cutoff = new Date(
      now - parseWindowDays() * 24 * 60 * 60 * 1000
    );
    const previous = await getPreviousSnapshot(cutoff);
    if (!previous) {
      const fallback = getHardcodedBaseApy();
      cachedBaseApy = {
        value: fallback,
        expiresAt: now + CACHE_TTL_MS,
      };
      return fallback;
    }

    const baseApy = computeAnnualizedApy({
      currentPrice,
      previousPrice: previous.value,
      elapsedMs: now - new Date(previous.capturedAt).getTime(),
    });

    cachedBaseApy = { value: baseApy, expiresAt: now + CACHE_TTL_MS };
    return baseApy;
  } catch (err) {
    console.warn(
      `[staking-rate] Falling back to default base APY. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    const fallback = getHardcodedBaseApy();
    cachedBaseApy = {
      value: fallback,
      expiresAt: now + CACHE_TTL_MS,
    };
    return fallback;
  }
}
