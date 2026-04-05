/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  POST /api/record-offset                                                ║
 * ║  Records a carbon offset proof on Solana devnet.                        ║
 * ║  Called by the AI Backend's Offset Agent after deciding credit type.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  OffsetStatus,
  RecordOffsetRequestSchema,
  RecordOffsetResponseSchema,
} from "@carboniq/contracts";
import * as solanaService from "../services/solanaService.js";
import * as toucanService from "../services/toucanService.js";
import {
  clampGreenScore,
  computeOffsetGreenScoreDelta,
} from "../lib/blockchain.js";
import { prisma } from "../lib/prisma.js";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";

type RecordOffsetDeps = {
  recordImpact: typeof solanaService.recordImpact;
  updateImpact: typeof solanaService.updateImpact;
  creditTypeToIndex: typeof solanaService.creditTypeToIndex;
  getProofOfImpact: typeof solanaService.getProofOfImpact;
  getProofOfImpactPda: typeof solanaService.getProofOfImpactPda;
  mockRetireCarbonCredits: typeof toucanService.mockRetireCarbonCredits;
  getProjectForCreditType: typeof toucanService.getProjectForCreditType;
};

const defaultDeps: RecordOffsetDeps = {
  recordImpact: solanaService.recordImpact,
  updateImpact: solanaService.updateImpact,
  creditTypeToIndex: solanaService.creditTypeToIndex,
  getProofOfImpact: solanaService.getProofOfImpact,
  getProofOfImpactPda: solanaService.getProofOfImpactPda,
  mockRetireCarbonCredits: toucanService.mockRetireCarbonCredits,
  getProjectForCreditType: toucanService.getProjectForCreditType,
};

export function createRecordOffsetRouter(
  deps: RecordOffsetDeps = defaultDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { wallet, co2eGrams, creditType, toucanTxHash } =
        RecordOffsetRequestSchema.parse(req.body);

      // 1. Mock Toucan credit retirement if no hash provided
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

      // 2. Determine if user already has an on-chain proof
      const creditTypeIndex = deps.creditTypeToIndex(creditType);
      let solanaSignature: string;
      let proofOfImpactAddress: string;
      let cumulativeCo2eGrams: number;

      const existingProof = await deps.getProofOfImpact(wallet);

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

      // 3. Upsert user in DB
      const greenScoreDelta = computeOffsetGreenScoreDelta(co2eGrams);
      const existingUser = await prisma.user.findUnique({
        where: { walletAddress: wallet },
      });
      const nextGreenScore = clampGreenScore(
        (existingUser?.greenScore ?? 0) + greenScoreDelta
      );

      const user = existingUser
        ? await prisma.user.update({
            where: { id: existingUser.id },
            data: { greenScore: nextGreenScore },
          })
        : await prisma.user.create({
            data: {
              walletAddress: wallet,
              greenScore: nextGreenScore,
            },
          });

      // 4. Store impact record
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

      const response = RecordOffsetResponseSchema.parse({
        wallet,
        solanaSignature,
        proofOfImpactAddress,
        cumulativeCo2eGrams,
        status: OffsetStatus.RECORDED_ON_CHAIN,
      });

      res.json(response);
    } catch (err) {
      if (isZodLikeError(err)) {
        res.status(400).json({
          error: "Validation error",
          details: getZodLikeDetails(err),
        });
        return;
      }
      console.error("Record offset error:", err);
      res.status(500).json({
        error: "Failed to record offset",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
}

export const recordOffsetRouter = createRecordOffsetRouter();
