import { roundTo } from "../lib/aiMath.js";
import type { RawTransaction } from "../lib/aiRules.js";

type SpendEstimate = {
  co2eGrams: number;
  emissionFactor: number;
  provider: "climatiq";
  methodology: "spend_based_procurement";
};

type ClimatiqProcurementResponse = {
  estimate?: {
    co2e?: number;
    co2e_unit?: string;
  };
};

const PROCUREMENT_ENDPOINT = "https://api.climatiq.io/procurement/v1/spend";
const warnedMessages = new Set<string>();

function warnOnce(message: string): void {
  if (warnedMessages.has(message)) {
    return;
  }

  warnedMessages.add(message);
  console.warn(message);
}

function shouldUseClimatiqProvider(): boolean {
  const enabled = process.env.CARBONIQ_USE_CLIMATIQ_EMISSIONS ?? "true";
  const forceInTest = process.env.CARBONIQ_FORCE_CLIMATIQ_IN_TEST === "true";
  const apiKey = process.env.CLIMATIQ_API_KEY?.trim();

  if (enabled === "false" || !apiKey) {
    return false;
  }

  if (process.env.NODE_ENV === "test" && !forceInTest) {
    return false;
  }

  return true;
}

function getTimeoutMs(): number {
  const configured = Number(
    process.env.CLIMATIQ_HTTP_TIMEOUT_SECONDS ??
      process.env.CARBONIQ_HTTP_TIMEOUT_SECONDS ??
      10
  );
  return Number.isFinite(configured) && configured > 0 ? configured * 1000 : 10_000;
}

function getSpendRegion(): string {
  return process.env.CLIMATIQ_SPEND_REGION?.trim() || "US";
}

function getSpendYear(isoDate: string): number {
  const parsed = new Date(isoDate);
  const year = parsed.getUTCFullYear();
  return Number.isFinite(year) ? year : new Date().getUTCFullYear();
}

class SpendEmissionsProvider {
  private readonly cache = new Map<string, SpendEstimate | null>();

  clearCache(): void {
    this.cache.clear();
  }

  async estimate(rawTransaction: RawTransaction): Promise<SpendEstimate | null> {
    if (!shouldUseClimatiqProvider() || !rawTransaction.mccCode) {
      return null;
    }

    const cacheKey = [
      rawTransaction.mccCode,
      rawTransaction.amountUsd.toFixed(2),
      getSpendYear(rawTransaction.date),
      getSpendRegion(),
    ].join(":");

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const response = await fetch(PROCUREMENT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLIMATIQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activity: {
            classification_code: rawTransaction.mccCode,
            classification_type: "mcc",
          },
          spend_year: getSpendYear(rawTransaction.date),
          spend_region: getSpendRegion(),
          money: rawTransaction.amountUsd,
          money_unit: "usd",
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        warnOnce(
          `Climatiq procurement fallback engaged (${response.status}). ${body || "Using local heuristic factors instead."}`
        );
        this.cache.set(cacheKey, null);
        return null;
      }

      const json = (await response.json()) as ClimatiqProcurementResponse;
      const co2e = json.estimate?.co2e;
      const unit = json.estimate?.co2e_unit?.toLowerCase();
      if (typeof co2e !== "number" || !Number.isFinite(co2e)) {
        this.cache.set(cacheKey, null);
        return null;
      }

      const co2eGrams =
        unit === "g" ? roundTo(co2e, 2) : roundTo(co2e * 1000, 2);
      const emissionFactor =
        rawTransaction.amountUsd > 0
          ? roundTo(co2eGrams / rawTransaction.amountUsd, 2)
          : 0;

      const estimate: SpendEstimate = {
        co2eGrams,
        emissionFactor,
        provider: "climatiq",
        methodology: "spend_based_procurement",
      };

      this.cache.set(cacheKey, estimate);
      return estimate;
    } catch (error) {
      warnOnce(
        `Climatiq procurement fallback engaged due to request failure: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
      this.cache.set(cacheKey, null);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const spendEmissionsProvider = new SpendEmissionsProvider();
