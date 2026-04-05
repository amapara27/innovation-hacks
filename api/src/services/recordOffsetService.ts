import {
  OffsetStatus,
  type RecordOffsetRequest,
  type RecordOffsetResponse,
} from "@carboniq/contracts";
import { prisma } from "../lib/prisma.js";
import { refreshStoredGreenScore } from "./greenScoreService.js";
import * as solanaService from "./solanaService.js";
import * as toucanService from "./toucanService.js";

export type RecordOffsetDeps = {
  recordImpact: typeof solanaService.recordImpact;
  updateImpact: typeof solanaService.updateImpact;
  creditTypeToIndex: typeof solanaService.creditTypeToIndex;
  getProofOfImpact: typeof solanaService.getProofOfImpact;
  getProofOfImpactPda: typeof solanaService.getProofOfImpactPda;
  mockRetireCarbonCredits: typeof toucanService.mockRetireCarbonCredits;
  getProjectForCreditType: typeof toucanService.getProjectForCreditType;
  refreshStoredGreenScore: typeof refreshStoredGreenScore;
};

export type ProcessedRecordOffsetResult = RecordOffsetResponse & {
  toucanTxHash: string;
};

export const defaultRecordOffsetDeps: RecordOffsetDeps = {
  recordImpact: solanaService.recordImpact,
  updateImpact: solanaService.updateImpact,
  creditTypeToIndex: solanaService.creditTypeToIndex,
  getProofOfImpact: solanaService.getProofOfImpact,
  getProofOfImpactPda: solanaService.getProofOfImpactPda,
  mockRetireCarbonCredits: toucanService.mockRetireCarbonCredits,
  getProjectForCreditType: toucanService.getProjectForCreditType,
  refreshStoredGreenScore,
};

export async function processRecordOffset(
  input: RecordOffsetRequest,
  deps: RecordOffsetDeps = defaultRecordOffsetDeps
): Promise<ProcessedRecordOffsetResult> {
  const { wallet, co2eGrams, creditType, toucanTxHash } = input;

  let finalToucanHash = toucanTxHash;
  if (!finalToucanHash) {
    const projectName = deps.getProjectForCreditType(creditType);
    const toucanResult = await deps.mockRetireCarbonCredits(
      creditType,
      co2eGrams,
      projectName
    );
    finalToucanHash = toucanResult.toucanTxHash;
  }

  const creditTypeIndex = deps.creditTypeToIndex(creditType);
  const existingProof = await deps.getProofOfImpact(wallet);

  let solanaSignature: string;
  let proofOfImpactAddress: string;
  let cumulativeCo2eGrams: number;

  if (!existingProof) {
    const result = await deps.recordImpact(wallet, co2eGrams, creditTypeIndex);
    solanaSignature = result.signature;
    proofOfImpactAddress = result.proofOfImpactAddress;
    cumulativeCo2eGrams = co2eGrams;
  } else {
    const result = await deps.updateImpact(wallet, co2eGrams, creditTypeIndex);
    solanaSignature = result.signature;
    proofOfImpactAddress = deps.getProofOfImpactPda(wallet).toBase58();
    cumulativeCo2eGrams = result.cumulativeCo2eGrams;
  }

  const user = await prisma.user.upsert({
    where: { walletAddress: wallet },
    update: {},
    create: {
      walletAddress: wallet,
      greenScore: 0,
    },
  });

  await prisma.impactRecord.create({
    data: {
      userId: user.id,
      co2OffsetGrams: co2eGrams,
      creditType,
      toucanTxHash: finalToucanHash,
      onChainTxHash: solanaSignature,
      proofPda: proofOfImpactAddress,
      status: OffsetStatus.RECORDED_ON_CHAIN,
    },
  });

  await deps.refreshStoredGreenScore(wallet);

  return {
    wallet,
    solanaSignature,
    proofOfImpactAddress,
    cumulativeCo2eGrams,
    status: OffsetStatus.RECORDED_ON_CHAIN,
    toucanTxHash: finalToucanHash,
  };
}
