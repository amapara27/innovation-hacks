/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Inferred TypeScript Types                                   ║
 * ║  Derived from Zod schemas — use these for type annotations everywhere.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import {
  // Primitives
  WalletAddressSchema,

  // Analyze Transactions
  AnalyzeTransactionsRequestSchema,
  AnalyzedTransactionSchema,
  AnalyzeTransactionsResponseSchema,

  // Green Score
  GreenScoreRequestSchema,
  GreenScoreBreakdownSchema,
  GreenScoreResponseSchema,

  // Swap Suggestions
  SwapSuggestionsRequestSchema,
  SwapSuggestionSchema,
  SwapSuggestionsResponseSchema,

  // Trigger Offset
  TriggerOffsetRequestSchema,
  OffsetDecisionSchema,
  TriggerOffsetResponseSchema,

  // Record Offset
  RecordOffsetRequestSchema,
  RecordOffsetResponseSchema,

  // Staking
  StakingInfoRequestSchema,
  StakingInfoResponseSchema,
  SimulateStakeRequestSchema,
  SimulateStakeResponseSchema,
  StakeRequestSchema,
  StakeResponseSchema,

  // Leaderboard
  LeaderboardRequestSchema,
  LeaderboardEntrySchema,
  LeaderboardResponseSchema,

  // NFT
  NftAttributeSchema,
  ImpactNftMetadataSchema,
} from "./schemas.js";

// ─── Primitive Types ────────────────────────────────────────────────────────

export type WalletAddress = z.infer<typeof WalletAddressSchema>;

// ─── Analyze Transactions ───────────────────────────────────────────────────

export type AnalyzeTransactionsRequest = z.infer<typeof AnalyzeTransactionsRequestSchema>;
export type AnalyzedTransaction = z.infer<typeof AnalyzedTransactionSchema>;
export type AnalyzeTransactionsResponse = z.infer<typeof AnalyzeTransactionsResponseSchema>;

// ─── Green Score ────────────────────────────────────────────────────────────

export type GreenScoreRequest = z.infer<typeof GreenScoreRequestSchema>;
export type GreenScoreBreakdown = z.infer<typeof GreenScoreBreakdownSchema>;
export type GreenScoreResponse = z.infer<typeof GreenScoreResponseSchema>;

// ─── Swap Suggestions ──────────────────────────────────────────────────────

export type SwapSuggestionsRequest = z.infer<typeof SwapSuggestionsRequestSchema>;
export type SwapSuggestion = z.infer<typeof SwapSuggestionSchema>;
export type SwapSuggestionsResponse = z.infer<typeof SwapSuggestionsResponseSchema>;

// ─── Trigger Offset ─────────────────────────────────────────────────────────

export type TriggerOffsetRequest = z.infer<typeof TriggerOffsetRequestSchema>;
export type OffsetDecision = z.infer<typeof OffsetDecisionSchema>;
export type TriggerOffsetResponse = z.infer<typeof TriggerOffsetResponseSchema>;

// ─── Record Offset ──────────────────────────────────────────────────────────

export type RecordOffsetRequest = z.infer<typeof RecordOffsetRequestSchema>;
export type RecordOffsetResponse = z.infer<typeof RecordOffsetResponseSchema>;

// ─── Staking ────────────────────────────────────────────────────────────────

export type StakingInfoRequest = z.infer<typeof StakingInfoRequestSchema>;
export type StakingInfoResponse = z.infer<typeof StakingInfoResponseSchema>;
export type SimulateStakeRequest = z.infer<typeof SimulateStakeRequestSchema>;
export type SimulateStakeResponse = z.infer<typeof SimulateStakeResponseSchema>;
export type StakeRequest = z.infer<typeof StakeRequestSchema>;
export type StakeResponse = z.infer<typeof StakeResponseSchema>;

// ─── Leaderboard ────────────────────────────────────────────────────────────

export type LeaderboardRequest = z.infer<typeof LeaderboardRequestSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

// ─── NFT ────────────────────────────────────────────────────────────────────

export type NftAttribute = z.infer<typeof NftAttributeSchema>;
export type ImpactNftMetadata = z.infer<typeof ImpactNftMetadataSchema>;
