import { createHash } from "node:crypto";
import { MAX_TRANSACTION_LIMIT } from "@carboniq/contracts";
import {
  LEDGER_END,
  LEDGER_INTERVAL_HOURS,
  MERCHANT_CATALOG,
  type RawTransaction,
} from "../lib/aiRules.js";
import { roundTo } from "../lib/aiMath.js";
import { demoBankLedgerService } from "./demoBankLedgerService.js";
import { getPersistedUploadTransactions } from "./walletDataService.js";

function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function getSeededTransactions(wallet: string): RawTransaction[] {
  const digest = createHash("sha256").update(wallet).digest();
  const walletPrefix = createHash("sha256")
    .update(wallet)
    .digest("hex")
    .slice(0, 12);
  const ledger: RawTransaction[] = [];

  for (let index = 0; index < MAX_TRANSACTION_LIMIT; index++) {
    const catalogIndex =
      (digest[index % 32]! + digest[(index * 7) % 32]! + index * 11) %
      MERCHANT_CATALOG.length;
    const template = MERCHANT_CATALOG[catalogIndex]!;
    const spreadSeed =
      (digest[(index + 3) % 32]! << 8) + digest[(index + 17) % 32]! + index * 97;
    const amountCents =
      template.baseAmountCents + (spreadSeed % template.spreadCents);
    const timestamp = new Date(
      LEDGER_END.getTime() - index * LEDGER_INTERVAL_HOURS * 60 * 60 * 1000
    );

    ledger.push({
      transactionId: `seeded_${walletPrefix}_${index.toString().padStart(3, "0")}`,
      description: template.description,
      amountUsd: roundTo(amountCents / 100, 2),
      mccCode: template.mccCode,
      date: toIsoSeconds(timestamp),
    });
  }

  return ledger;
}

export const transactionProvider = {
  async getTransactions(
    wallet: string,
    _plaidAccessToken?: string
  ): Promise<{
    transactions: RawTransaction[];
    source: "upload" | "seeded";
    sourceLabel?: string;
  }> {
    const persistedUpload = await getPersistedUploadTransactions(wallet);
    if (persistedUpload.length > 0) {
      return {
        transactions: persistedUpload.map((transaction) => ({
          transactionId: transaction.transactionId,
          description: transaction.description,
          amountUsd: transaction.amountUsd,
          mccCode: transaction.mccCode ?? undefined,
          date: toIsoSeconds(transaction.date),
        })),
        source: "upload",
      };
    }

    const connectedLedger = demoBankLedgerService.getWalletLedger(wallet);
    if (connectedLedger) {
      return {
        transactions: connectedLedger,
        source: "upload",
      };
    }

    return {
      transactions: getSeededTransactions(wallet),
      source: "seeded",
    };
  },
};
