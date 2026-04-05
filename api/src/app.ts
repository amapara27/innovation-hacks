import cors from "cors";
import express from "express";

import { analyzeTransactionsRouter } from "./routes/analyzeTransactions.js";
import { demoConnectBankRouter } from "./routes/demoConnectBank.js";
import { greenScoreRouter } from "./routes/greenScore.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { nftMetadataRouter } from "./routes/nftMetadata.js";
import { recommendationActionsRouter } from "./routes/recommendationActions.js";
import { recordOffsetRouter } from "./routes/recordOffset.js";
import { stakeRouter } from "./routes/stake.js";
import { stakeCollectRouter } from "./routes/stakeCollect.js";
import { stakeWithdrawRouter } from "./routes/stakeWithdraw.js";
import { simulateStakeRouter } from "./routes/simulateStake.js";
import { simulateStakeTimelineRouter } from "./routes/simulateStakeTimeline.js";
import { stakingInfoRouter } from "./routes/stakingInfo.js";
import { swapSuggestionsRouter } from "./routes/swapSuggestions.js";
import { triggerOffsetRouter } from "./routes/triggerOffset.js";
import { walletStateRouter } from "./routes/walletState.js";

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
  app.use("/api/demo/connect-bank", demoConnectBankRouter);
  app.use("/api/green-score", greenScoreRouter);
  app.use("/api/wallet-state", walletStateRouter);
  app.use("/api/swap-suggestions", swapSuggestionsRouter);
  app.use("/api/recommendation-actions", recommendationActionsRouter);
  app.use("/api/trigger-offset", triggerOffsetRouter);

  app.use("/api/simulate-stake", simulateStakeRouter);
  app.use("/api/simulate-stake-timeline", simulateStakeTimelineRouter);
  app.use("/api/stake/collect", stakeCollectRouter);
  app.use("/api/stake/withdraw", stakeWithdrawRouter);
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
