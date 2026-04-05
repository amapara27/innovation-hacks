/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  @carboniq/contracts — Barrel Export                                     ║
 * ║  Import everything from "@carboniq/contracts"                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// Enums
export {
  EmissionCategory,
  CarbonCreditType,
  OffsetStatus,
  GreenScoreTier,
  NftRarity,
} from "./enums.js";

// Constants
export {
  GREEN_SCORE_MIN,
  GREEN_SCORE_MAX,
  GREEN_SCORE_WEIGHTS,
  GREEN_SCORE_TIER_THRESHOLDS,
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
  STAKING_MAX_AMOUNT,
  STAKING_MAX_DURATION_DAYS,
  OFFSET_MIN_GRAMS,
  OFFSET_MAX_GRAMS,
  DEFAULT_TRANSACTION_LIMIT,
  MAX_TRANSACTION_LIMIT,
  SWAP_SUGGESTIONS_COUNT,
  LEADERBOARD_PAGE_SIZE,
  WALLET_ADDRESS_MIN_LENGTH,
  WALLET_ADDRESS_MAX_LENGTH,
} from "./constants.js";

// Zod Schemas
export {
  WalletAddressSchema,
  EmissionCategorySchema,
  CarbonCreditTypeSchema,
  OffsetStatusSchema,
  GreenScoreTierSchema,
  NftRaritySchema,
  AnalyzeTransactionsRequestSchema,
  AnalyzedTransactionSchema,
  AnalyzeTransactionsResponseSchema,
  GreenScoreRequestSchema,
  GreenScoreBreakdownSchema,
  GreenScoreResponseSchema,
  SwapSuggestionsRequestSchema,
  SwapSuggestionSchema,
  SwapSuggestionsResponseSchema,
  TriggerOffsetRequestSchema,
  OffsetDecisionSchema,
  TriggerOffsetResponseSchema,
  RecordOffsetRequestSchema,
  RecordOffsetResponseSchema,
  StakingInfoRequestSchema,
  StakingInfoResponseSchema,
  SimulateStakeRequestSchema,
  SimulateStakeResponseSchema,
  StakeRequestSchema,
  StakeResponseSchema,
  LeaderboardRequestSchema,
  LeaderboardEntrySchema,
  LeaderboardResponseSchema,
  NftAttributeSchema,
  ImpactNftMetadataSchema,
} from "./schemas.js";

// TypeScript Types
export type {
  WalletAddress,
  AnalyzeTransactionsRequest,
  AnalyzedTransaction,
  AnalyzeTransactionsResponse,
  GreenScoreRequest,
  GreenScoreBreakdown,
  GreenScoreResponse,
  SwapSuggestionsRequest,
  SwapSuggestion,
  SwapSuggestionsResponse,
  TriggerOffsetRequest,
  OffsetDecision,
  TriggerOffsetResponse,
  RecordOffsetRequest,
  RecordOffsetResponse,
  StakingInfoRequest,
  StakingInfoResponse,
  SimulateStakeRequest,
  SimulateStakeResponse,
  StakeRequest,
  StakeResponse,
  LeaderboardRequest,
  LeaderboardEntry,
  LeaderboardResponse,
  NftAttribute,
  ImpactNftMetadata,
} from "./types.js";

// Route Map
export { API_ROUTES } from "./routes.js";
export type { ApiRoutePath, ApiRouteOwner } from "./routes.js";
