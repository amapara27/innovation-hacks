import cors from "cors";
import express from "express";

import { analyzeTransactionsRouter } from "./routes/analyzeTransactions.js";
import { greenScoreRouter } from "./routes/greenScore.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { nftMetadataRouter } from "./routes/nftMetadata.js";
import { recordOffsetRouter } from "./routes/recordOffset.js";
import { stakeRouter } from "./routes/stake.js";
import { simulateStakeRouter } from "./routes/simulateStake.js";
import { stakingInfoRouter } from "./routes/stakingInfo.js";
import { swapSuggestionsRouter } from "./routes/swapSuggestions.js";
import { triggerOffsetRouter } from "./routes/triggerOffset.js";

export function createApp() {
  const app = express();

  app.use(
    cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" })
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "carboniq-api", timestamp: Date.now() });
  });

  app.use("/api/analyze-transactions", analyzeTransactionsRouter);
  app.use("/api/green-score", greenScoreRouter);
  app.use("/api/swap-suggestions", swapSuggestionsRouter);
  app.use("/api/trigger-offset", triggerOffsetRouter);

  app.use("/api/simulate-stake", simulateStakeRouter);
  app.use("/api/stake", stakeRouter);
  app.use("/api/staking-info", stakingInfoRouter);
  app.use("/api/record-offset", recordOffsetRouter);
  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/nft-metadata", nftMetadataRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
