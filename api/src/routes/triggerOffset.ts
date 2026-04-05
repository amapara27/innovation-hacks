import { Router, type Request, type Response } from "express";
import {
  TriggerOffsetRequestSchema,
  TriggerOffsetResponseSchema,
} from "@carboniq/contracts";
import { getZodLikeDetails, isZodLikeError } from "../lib/validation.js";
import { processRecordOffset } from "../services/recordOffsetService.js";
import {
  BusinessRuleError,
  triggerOffsetAndRecord,
} from "../services/triggerOffsetService.js";

type TriggerOffsetDeps = {
  processRecordOffset: typeof processRecordOffset;
};

const defaultDeps: TriggerOffsetDeps = {
  processRecordOffset,
};

export function createTriggerOffsetRouter(
  deps: TriggerOffsetDeps = defaultDeps
) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = TriggerOffsetRequestSchema.parse(req.body);
      const response = TriggerOffsetResponseSchema.parse(
        await triggerOffsetAndRecord(request, (input, decisionContext) =>
          deps.processRecordOffset(input, undefined, decisionContext)
        )
      );
      res.json(response);
    } catch (err) {
      if (isZodLikeError(err)) {
        res.status(400).json({
          error: "Validation error",
          details: getZodLikeDetails(err),
        });
        return;
      }
      if (err instanceof BusinessRuleError) {
        res.status(422).json({ error: err.message });
        return;
      }
      console.error("Trigger offset error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}

export const triggerOffsetRouter = createTriggerOffsetRouter();
