import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

type SpendEmissionsProviderModule = typeof import(
  "../src/services/spendEmissionsProvider.js"
);

let spendEmissionsProviderModule: SpendEmissionsProviderModule;
const originalFetch = globalThis.fetch;
const originalApiKey = process.env.CLIMATIQ_API_KEY;
const originalUseClimatiq = process.env.CARBONIQ_USE_CLIMATIQ_EMISSIONS;
const originalForceInTest = process.env.CARBONIQ_FORCE_CLIMATIQ_IN_TEST;
const originalRegion = process.env.CLIMATIQ_SPEND_REGION;

beforeEach(async () => {
  spendEmissionsProviderModule = await import(
    "../src/services/spendEmissionsProvider.js"
  );
  spendEmissionsProviderModule.spendEmissionsProvider.clearCache();
  process.env.CARBONIQ_USE_CLIMATIQ_EMISSIONS = "true";
  process.env.CARBONIQ_FORCE_CLIMATIQ_IN_TEST = "true";
  process.env.CLIMATIQ_SPEND_REGION = "US";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.CLIMATIQ_API_KEY = originalApiKey;
  process.env.CARBONIQ_USE_CLIMATIQ_EMISSIONS = originalUseClimatiq;
  process.env.CARBONIQ_FORCE_CLIMATIQ_IN_TEST = originalForceInTest;
  process.env.CLIMATIQ_SPEND_REGION = originalRegion;
  spendEmissionsProviderModule.spendEmissionsProvider.clearCache();
});

describe("spend emissions provider", () => {
  it("returns null when no Climatiq API key is configured", async () => {
    process.env.CLIMATIQ_API_KEY = "";

    const estimate =
      await spendEmissionsProviderModule.spendEmissionsProvider.estimate({
        transactionId: "tx_1",
        description: "Trader Joe's groceries",
        amountUsd: 86,
        mccCode: "5411",
        date: "2026-03-20T18:15:00Z",
      });

    assert.equal(estimate, null);
  });

  it("calls Climatiq procurement with MCC spend data and parses kg into grams", async () => {
    process.env.CLIMATIQ_API_KEY = "climatiq_test_key";

    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;

      return new Response(
        JSON.stringify({
          estimate: {
            co2e: 12.34,
            co2e_unit: "kg",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }) as typeof fetch;

    const estimate =
      await spendEmissionsProviderModule.spendEmissionsProvider.estimate({
        transactionId: "tx_2",
        description: "Whole Foods produce",
        amountUsd: 74,
        mccCode: "5411",
        date: "2026-03-19T18:10:00Z",
      });

    assert.equal(requestUrl, "https://api.climatiq.io/procurement/v1/spend");
    assert.equal(requestInit?.method, "POST");
    assert.equal(
      (requestInit?.headers as Record<string, string>)?.Authorization,
      "Bearer climatiq_test_key"
    );

    const body = JSON.parse(String(requestInit?.body));
    assert.deepEqual(body, {
      activity: {
        classification_code: "5411",
        classification_type: "mcc",
      },
      spend_year: 2026,
      spend_region: "US",
      money: 74,
      money_unit: "usd",
    });

    assert.deepEqual(estimate, {
      co2eGrams: 12_340,
      emissionFactor: 166.76,
      provider: "climatiq",
      methodology: "spend_based_procurement",
    });
  });
});
