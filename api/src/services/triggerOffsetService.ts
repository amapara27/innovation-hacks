import {
  type OffsetDecision,
  OffsetStatus,
  type TriggerOffsetRequest,
  type TriggerOffsetResponse,
} from "@carboniq/contracts";
import {
  CATEGORY_ORDER,
  CATEGORY_ORDER_INDEX,
  CREDIT_PROFILES,
  DOMINANT_CATEGORY_CREDIT_MAP,
  type EmissionCategoryValue,
} from "../lib/aiRules.js";
import { roundTo } from "../lib/aiMath.js";
import { prisma } from "../lib/prisma.js";
import { emissionsService } from "./emissionsService.js";

export class BusinessRuleError extends Error {}

function selectDominantCategory(
  categoryTotals: Record<EmissionCategoryValue, number>
): EmissionCategoryValue {
  return [...CATEGORY_ORDER].sort(
    (left, right) =>
      categoryTotals[right] - categoryTotals[left] ||
      CATEGORY_ORDER_INDEX[left] - CATEGORY_ORDER_INDEX[right]
  )[0]!;
}

export async function getTriggerOffsetDecision(
  request: TriggerOffsetRequest
): Promise<OffsetDecision> {
  const snapshot = emissionsService.getCanonicalSnapshot(request.wallet);
  const confirmedOffsets = await prisma.impactRecord.aggregate({
    where: {
      status: OffsetStatus.RECORDED_ON_CHAIN,
      user: { walletAddress: request.wallet },
    },
    _sum: { co2OffsetGrams: true },
  });

  const confirmedOffsetGrams = confirmedOffsets._sum.co2OffsetGrams ?? 0;
  const outstandingGrams = roundTo(
    snapshot.totalCo2eGrams - confirmedOffsetGrams,
    2
  );
  if (outstandingGrams < 1) {
    throw new BusinessRuleError(
      "No outstanding emissions remain to offset for this wallet."
    );
  }

  const dominantCategory = selectDominantCategory(snapshot.categoryEmissionTotals);
  let selectedCreditType =
    request.preferredCreditType ?? DOMINANT_CATEGORY_CREDIT_MAP[dominantCategory];
  let selectedProfile = CREDIT_PROFILES[selectedCreditType];
  let affordableGrams = Math.floor(
    (request.budgetUsd / selectedProfile.pricePerTonneUsd) * 1_000_000
  );

  if (request.preferredCreditType && affordableGrams < 1) {
    const fallbackCreditType = DOMINANT_CATEGORY_CREDIT_MAP[dominantCategory];
    const fallbackProfile = CREDIT_PROFILES[fallbackCreditType];
    const fallbackAffordableGrams = Math.floor(
      (request.budgetUsd / fallbackProfile.pricePerTonneUsd) * 1_000_000
    );
    if (fallbackAffordableGrams < 1) {
      throw new BusinessRuleError(
        "The provided budget cannot purchase at least 1 gram of carbon credits."
      );
    }
    selectedCreditType = fallbackCreditType;
    selectedProfile = fallbackProfile;
    affordableGrams = fallbackAffordableGrams;
  }

  if (affordableGrams < 1) {
    throw new BusinessRuleError(
      "The provided budget cannot purchase at least 1 gram of the selected credit."
    );
  }

  const co2eGrams = Math.min(outstandingGrams, affordableGrams);
  if (co2eGrams < 1) {
    throw new BusinessRuleError(
      "The provided budget cannot purchase at least 1 gram of carbon credits."
    );
  }

  const costUsd = roundTo(
    (selectedProfile.pricePerTonneUsd * co2eGrams) / 1_000_000,
    2
  );

  return {
    creditType: selectedCreditType,
    co2eGrams: roundTo(co2eGrams, 2),
    costUsd,
    pricePerTonneUsd: roundTo(selectedProfile.pricePerTonneUsd, 2),
    projectName: selectedProfile.projectName,
    verificationStandard: selectedProfile.verificationStandard,
  };
}

export async function triggerOffsetAndRecord(
  request: TriggerOffsetRequest,
  processRecordOffset: (input: {
    wallet: string;
    co2eGrams: number;
    creditType: OffsetDecision["creditType"];
    toucanTxHash?: string;
  }) => Promise<{ status: string; toucanTxHash: string }>
): Promise<TriggerOffsetResponse> {
  const decision = await getTriggerOffsetDecision(request);
  const recorded = await processRecordOffset({
    wallet: request.wallet,
    co2eGrams: decision.co2eGrams,
    creditType: decision.creditType,
  });

  return {
    wallet: request.wallet,
    decision,
    status: recorded.status as TriggerOffsetResponse["status"],
    toucanTxHash: recorded.toucanTxHash,
  };
}
