/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  POST /api/record-offset                                                ║
 * ║  Records a carbon offset proof on Solana devnet.                        ║
 * ║  Called directly or via the unified /api/trigger-offset flow.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { Router, type Request, type Response } from "express";
import {
  RecordOffsetRequestSchema,
  RecordOffsetResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import {
  defaultRecordOffsetDeps,
  processRecordOffset,
  type RecordOffsetDeps,
} from "../services/recordOffsetService.js";

export function createRecordOffsetRouter(
  deps: RecordOffsetDeps = defaultRecordOffsetDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = RecordOffsetRequestSchema.parse(req.body);
      const recorded = await processRecordOffset(request, deps);
      const response = RecordOffsetResponseSchema.parse(recorded);
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
