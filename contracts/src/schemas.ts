/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Zod Schemas                                                 ║
 * ║  Runtime-validated schemas for every API boundary between the two        ║
 * ║  backends. Import these in route handlers for request/response           ║
 * ║  validation. Your partner should mirror these shapes in Pydantic.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";
import {
  EmissionCategory,
  CarbonCreditType,
  OffsetStatus,
  GreenScoreTier,
  NftRarity,
} from "./enums.js";
import {
  WALLET_ADDRESS_MIN_LENGTH,
  WALLET_ADDRESS_MAX_LENGTH,
  MAX_TRANSACTION_LIMIT,
  DEFAULT_TRANSACTION_LIMIT,
  GREEN_SCORE_MIN,
  GREEN_SCORE_MAX,
  STAKING_MAX_AMOUNT,
  STAKING_MAX_DURATION_DAYS,
  OFFSET_MIN_GRAMS,
  OFFSET_MAX_GRAMS,
  LEADERBOARD_PAGE_SIZE,
} from "./constants.js";

// ─── Primitives ─────────────────────────────────────────────────────────────

export const WalletAddressSchema = z
  .string()
  .min(WALLET_ADDRESS_MIN_LENGTH)
  .max(WALLET_ADDRESS_MAX_LENGTH);

export const EmissionCategorySchema = z.enum([
  EmissionCategory.TRANSPORTATION,
  EmissionCategory.FOOD_DINING,
  EmissionCategory.GROCERIES,
  EmissionCategory.UTILITIES,
  EmissionCategory.SHOPPING,
  EmissionCategory.TRAVEL,
  EmissionCategory.GAS_FUEL,
  EmissionCategory.HOME,
  EmissionCategory.ENTERTAINMENT,
  EmissionCategory.HEALTH,
  EmissionCategory.OTHER,
]);

export const CarbonCreditTypeSchema = z.enum([
  CarbonCreditType.RENEWABLE_ENERGY,
  CarbonCreditType.FORESTRY,
  CarbonCreditType.METHANE_CAPTURE,
  CarbonCreditType.DIRECT_AIR_CAPTURE,
  CarbonCreditType.SOIL_CARBON,
  CarbonCreditType.OCEAN_BASED,
]);

export const OffsetStatusSchema = z.enum([
  OffsetStatus.PENDING,
  OffsetStatus.PURCHASED,
  OffsetStatus.RECORDED_ON_CHAIN,
  OffsetStatus.FAILED,
]);

export const GreenScoreTierSchema = z.enum([
  GreenScoreTier.SEEDLING,
  GreenScoreTier.SPROUT,
  GreenScoreTier.TREE,
  GreenScoreTier.FOREST,
  GreenScoreTier.EARTH_GUARDIAN,
]);

export const NftRaritySchema = z.enum([
  NftRarity.COMMON,
  NftRarity.UNCOMMON,
  NftRarity.RARE,
  NftRarity.EPIC,
  NftRarity.LEGENDARY,
]);

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/analyze-transactions
//  AI Backend → produces transaction analysis from Plaid data
// ═══════════════════════════════════════════════════════════════════════════

export const AnalyzeTransactionsRequestSchema = z.object({
  /** Solana wallet address of the user. */
  wallet: WalletAddressSchema,
  /** Plaid access token to fetch transaction data. */
  plaidAccessToken: z.string().optional(),
  /** Max transactions to analyze. */
  limit: z.number().int().min(1).max(MAX_TRANSACTION_LIMIT).default(DEFAULT_TRANSACTION_LIMIT),
});

/** A single categorized+scored transaction from the Footprint Agent. */
export const AnalyzedTransactionSchema = z.object({
  /** Original transaction ID from Plaid or internal. */
  transactionId: z.string(),
  /** Human-readable merchant/description. */
  description: z.string(),
  /** Transaction amount in USD. */
  amountUsd: z.number(),
  /** MCC code from Plaid (if available). */
  mccCode: z.string().optional(),
  /** Our emission category derived from MCC. */
  category: EmissionCategorySchema,
  /** Estimated CO₂e in grams for this transaction. */
  co2eGrams: z.number().nonnegative(),
  /** Emission factor applied (kgCO₂/USD or similar). */
  emissionFactor: z.number().nonnegative(),
  /** ISO 8601 timestamp. */
  date: z.string(),
});

export const AnalyzeTransactionsResponseSchema = z.object({
  wallet: WalletAddressSchema,
  transactionCount: z.number().int().nonnegative(),
  totalCo2eGrams: z.number().nonnegative(),
  /** CO₂e broken down by category. */
  categoryBreakdown: z.record(EmissionCategorySchema, z.number().nonnegative()),
  transactions: z.array(AnalyzedTransactionSchema),
  /** ISO 8601 timestamp of when analysis was run. */
  analyzedAt: z.string(),
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/demo/connect-bank
//  Demo ingestion endpoint for preset/upload synthetic transactions
// ═══════════════════════════════════════════════════════════════════════════

export const DemoTransactionInputSchema = z.object({
  transactionId: z.string(),
  description: z.string(),
  amountUsd: z.number(),
  mccCode: z.string().optional(),
  date: z.string(),
});

export const DemoConnectBankRequestSchema = z
  .object({
    wallet: WalletAddressSchema,
    mode: z.enum(["preset", "upload"]),
    scenario: z.enum(["sustainable", "mixed", "irresponsible"]).optional(),
    transactions: z
      .array(DemoTransactionInputSchema)
      .min(1)
      .max(MAX_TRANSACTION_LIMIT)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "preset" && !value.scenario) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scenario is required when mode is preset",
        path: ["scenario"],
      });
    }

    if (value.mode === "upload" && !value.transactions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transactions are required when mode is upload",
        path: ["transactions"],
      });
    }
  });

export const DemoConnectBankResponseSchema = z.object({
  wallet: WalletAddressSchema,
  mode: z.enum(["preset", "upload"]),
  sourceLabel: z.string(),
  transactionCount: z.number().int().nonnegative(),
  connectedAt: z.string(),
});

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/green-score?wallet=<address>
//  AI Backend computes, Blockchain Backend stores + uses for staking
// ═══════════════════════════════════════════════════════════════════════════

export const GreenScoreRequestSchema = z.object({
  wallet: WalletAddressSchema,
});

export const GreenScoreBreakdownSchema = z.object({
  /** 0–100 score for transaction efficiency. */
  transactionEfficiency: z.number().min(0).max(100),
  /** 0–100 score for spending habits sustainability. */
  spendingHabits: z.number().min(0).max(100),
  /** 0–100 score for carbon offset activity. */
  carbonOffsets: z.number().min(0).max(100),
  /** 0–100 score for community/social impact. */
  communityImpact: z.number().min(0).max(100),
});

export const GreenScoreResponseSchema = z.object({
  wallet: WalletAddressSchema,
  /** Composite Green Score (0–100). */
  score: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
  /** Display tier derived from the score. */
  tier: GreenScoreTierSchema,
  /** Component-level breakdown. */
  breakdown: GreenScoreBreakdownSchema,
  /** User rank on leaderboard. */
  rank: z.number().int().positive().optional(),
  /** Total number of scored users. */
  totalUsers: z.number().int().nonnegative().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/swap-suggestions?wallet=<address>
//  AI Backend → Swap Agent produces lower-emission alternatives
// ═══════════════════════════════════════════════════════════════════════════

export const SwapSuggestionsRequestSchema = z.object({
  wallet: WalletAddressSchema,
  /** Optionally restrict to specific categories. */
  categories: z.array(EmissionCategorySchema).optional(),
});

export const SwapSuggestionSchema = z.object({
  /** The high-emission category being replaced. */
  currentCategory: EmissionCategorySchema,
  /** Description of user's current habit/product. */
  currentDescription: z.string(),
  /** Monthly CO₂e in grams for the current option. */
  currentCo2eMonthly: z.number().nonnegative(),
  /** Suggested lower-emission alternative. */
  alternativeDescription: z.string(),
  /** Monthly CO₂e in grams for the alternative. */
  alternativeCo2eMonthly: z.number().nonnegative(),
  /** Estimated monthly CO₂ savings in grams. */
  co2eSavingsMonthly: z.number().nonnegative(),
  /** Price comparison — negative means cheaper. */
  priceDifferenceUsd: z.number(),
  /** Difficulty of swap: easy, moderate, hard. */
  difficulty: z.enum(["easy", "moderate", "hard"]),
});

export const SwapSuggestionsResponseSchema = z.object({
  wallet: WalletAddressSchema,
  suggestions: z.array(SwapSuggestionSchema).min(1).max(5),
  /** Total potential monthly CO₂ savings in grams. */
  totalPotentialSavingsMonthly: z.number().nonnegative(),
});

export const RecommendationActionRequestSchema = z.object({
  wallet: WalletAddressSchema,
  suggestionKey: z.string().min(1),
  action: z.enum(["adopted", "cleared"]),
});

export const RecommendationActionResponseSchema = z.object({
  wallet: WalletAddressSchema,
  suggestionKey: z.string(),
  action: z.enum(["adopted", "cleared"]),
  actedAt: z.string(),
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/trigger-offset
//  AI Backend → Offset Agent decides credit type + amount
//  Blockchain Backend → records on Solana
// ═══════════════════════════════════════════════════════════════════════════

export const TriggerOffsetRequestSchema = z.object({
  wallet: WalletAddressSchema,
  /** User's budget in USD for this offset. */
  budgetUsd: z.number().positive(),
  /** Preferred credit type (Offset Agent may override). */
  preferredCreditType: CarbonCreditTypeSchema.optional(),
});

/** What the AI Offset Agent returns — then Blockchain Backend records it. */
export const OffsetDecisionSchema = z.object({
  /** Selected carbon credit type. */
  creditType: CarbonCreditTypeSchema,
  /** CO₂ offset amount in grams. */
  co2eGrams: z.number().min(OFFSET_MIN_GRAMS).max(OFFSET_MAX_GRAMS),
  /** Actual cost in USD (may be ≤ budget). */
  costUsd: z.number().nonnegative(),
  /** Price per tonne of CO₂e in USD. */
  pricePerTonneUsd: z.number().positive(),
  /** Name of the offset project. */
  projectName: z.string(),
  /** Verification standard (e.g., Verra VCS, Gold Standard). */
  verificationStandard: z.string().optional(),
});

export const TriggerOffsetResponseSchema = z.object({
  wallet: WalletAddressSchema,
  decision: OffsetDecisionSchema,
  /** Current status in the purchase+recording flow. */
  status: OffsetStatusSchema,
  /** Toucan Protocol tx hash (mock). */
  toucanTxHash: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/record-offset
//  Blockchain Backend → writes proof-of-impact to Solana devnet
// ═══════════════════════════════════════════════════════════════════════════

export const RecordOffsetRequestSchema = z.object({
  wallet: WalletAddressSchema,
  /** CO₂ offset amount in grams (matches what goes on-chain). */
  co2eGrams: z.number().min(OFFSET_MIN_GRAMS).max(OFFSET_MAX_GRAMS),
  /** Carbon credit type string (stored in metadata, not on-chain). */
  creditType: CarbonCreditTypeSchema,
  /** Reference to the Toucan Protocol tx. */
  toucanTxHash: z.string().optional(),
});

export const RecordOffsetResponseSchema = z.object({
  wallet: WalletAddressSchema,
  /** Solana transaction signature for the proof-of-impact write. */
  solanaSignature: z.string(),
  /** PDA address of the ProofOfImpact account. */
  proofOfImpactAddress: z.string(),
  /** Total cumulative CO₂ offset in grams after this recording. */
  cumulativeCo2eGrams: z.number().nonnegative(),
  status: OffsetStatusSchema,
});

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/staking-info?wallet=<address>
//  POST /api/simulate-stake
//  Blockchain Backend — staking simulation
// ═══════════════════════════════════════════════════════════════════════════

export const StakingInfoRequestSchema = z.object({
  wallet: WalletAddressSchema,
});

export const StakingInfoResponseSchema = z.object({
  wallet: WalletAddressSchema,
  /** User's current Green Score used for yield boost. */
  greenScore: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
  /** Base APY without green bonus (percent). */
  baseApy: z.number(),
  /** Additional APY from green score (percent). */
  greenBonus: z.number().nonnegative(),
  /** Total effective APY (percent). */
  effectiveApy: z.number(),
  /** Current staked amount in SOL (0 if not staking). */
  stakedAmount: z.number().nonnegative(),
  /** Current yield accrued in SOL. */
  accruedYield: z.number().nonnegative(),
  /** Vault destination for wallet-signed demo staking transfers. */
  stakeVaultAddress: WalletAddressSchema.optional(),
});

export const SimulateStakeRequestSchema = z.object({
  /** Amount of SOL to stake. */
  amount: z.number().positive().max(STAKING_MAX_AMOUNT),
  /** Staking duration in days. */
  durationDays: z.number().int().min(1).max(STAKING_MAX_DURATION_DAYS),
  /** Green Score to use for yield calculation (0–100). */
  greenScore: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
});

export const SimulateStakeResponseSchema = z.object({
  principal: z.number().positive(),
  durationDays: z.number().int().positive(),
  baseApy: z.number(),
  greenBonus: z.number().nonnegative(),
  effectiveApy: z.number(),
  estimatedYield: z.number().nonnegative(),
  totalReturn: z.number().positive(),
});

export const StakeRequestSchema = z.object({
  wallet: WalletAddressSchema,
  amount: z.number().positive().max(STAKING_MAX_AMOUNT),
  durationDays: z.number().int().min(1).max(STAKING_MAX_DURATION_DAYS),
  /** Optional wallet-signed transfer signature from frontend staking flow. */
  solanaSignature: z.string().optional(),
});

export const StakeResponseSchema = z.object({
  wallet: WalletAddressSchema,
  amount: z.number().positive(),
  durationDays: z.number().int().positive(),
  greenScore: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
  effectiveApy: z.number(),
  estimatedYield: z.number().nonnegative(),
  vaultAddress: WalletAddressSchema,
  solanaSignature: z.string(),
  status: z.enum(["confirmed", "failed"]),
});

export const StakeSettlementSourceSchema = z.enum([
  "vault_onchain",
  "api_payer_onchain",
  "demo_accounting",
]);

export const StakeCollectRequestSchema = z.object({
  wallet: WalletAddressSchema,
});

export const StakeCollectResponseSchema = z.object({
  wallet: WalletAddressSchema,
  collectedAmount: z.number().nonnegative(),
  remainingAccruedYield: z.number().nonnegative(),
  settlementSource: StakeSettlementSourceSchema,
  solanaSignature: z.string().optional(),
  explorerUrl: z.string().optional(),
});

export const StakeWithdrawRequestSchema = z.object({
  wallet: WalletAddressSchema,
  amount: z.number().positive().max(STAKING_MAX_AMOUNT),
});

export const StakeWithdrawResponseSchema = z.object({
  wallet: WalletAddressSchema,
  withdrawnAmount: z.number().positive(),
  remainingStakedAmount: z.number().nonnegative(),
  settlementSource: StakeSettlementSourceSchema,
  solanaSignature: z.string().optional(),
  explorerUrl: z.string().optional(),
});

export const SimulateStakeTimelineRequestSchema = z.object({
  principal: z.number().nonnegative().max(STAKING_MAX_AMOUNT),
  currentAccruedYield: z.number().nonnegative(),
  greenScore: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
  horizonDays: z.number().int().min(1).max(STAKING_MAX_DURATION_DAYS),
});

export const SimulateStakeTimelineEventSchema = z.object({
  day: z.number().int().positive(),
  type: z.enum(["soft_decay_started", "hard_reset_triggered"]),
  description: z.string(),
});

export const SimulateStakeTimelinePointSchema = z.object({
  day: z.number().int().nonnegative(),
  projectedAccruedYield: z.number().nonnegative(),
  baselineAccruedYield: z.number().nonnegative(),
  multiplier: z.number().min(0).max(1),
});

export const SimulateStakeTimelineResponseSchema = z.object({
  horizonDays: z.number().int().positive(),
  projectedAccruedYield: z.number().nonnegative(),
  baselineAccruedYield: z.number().nonnegative(),
  earningsDelta: z.number(),
  events: z.array(SimulateStakeTimelineEventSchema),
  points: z.array(SimulateStakeTimelinePointSchema).min(1),
});

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/leaderboard
//  Blockchain Backend — Green Score leaderboard
// ═══════════════════════════════════════════════════════════════════════════

export const LeaderboardRequestSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(LEADERBOARD_PAGE_SIZE).default(20),
});

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  wallet: WalletAddressSchema,
  /** Truncated wallet for display (e.g., "AbCd…xYz1"). */
  walletShort: z.string(),
  score: z.number().min(GREEN_SCORE_MIN).max(GREEN_SCORE_MAX),
  tier: GreenScoreTierSchema,
  /** Total lifetime CO₂ offset in grams. */
  totalCo2eOffset: z.number().nonnegative(),
});

export const LeaderboardResponseSchema = z.object({
  entries: z.array(LeaderboardEntrySchema),
  totalEntries: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

export const WalletStateResponseSchema = z.object({
  wallet: WalletAddressSchema,
  hasUploadedTransactions: z.boolean(),
  latestUploadAt: z.string().optional(),
  analysis: AnalyzeTransactionsResponseSchema.nullable(),
  greenScore: GreenScoreResponseSchema.nullable(),
  stakingInfo: StakingInfoResponseSchema.nullable(),
  latestRecommendations: SwapSuggestionsResponseSchema.nullable(),
  adoptedSuggestionKeys: z.array(z.string()),
});

// ═══════════════════════════════════════════════════════════════════════════
//  Impact NFT Metadata (Metaplex-compatible)
//  Blockchain Backend builds this; AI Backend may contribute attributes
// ═══════════════════════════════════════════════════════════════════════════

export const NftAttributeSchema = z.object({
  trait_type: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const ImpactNftMetadataSchema = z.object({
  name: z.string(),
  symbol: z.string().default("CIQNFT"),
  description: z.string(),
  /** URI to the NFT image. */
  image: z.string().url(),
  /** URI to the full metadata JSON (off-chain). */
  external_url: z.string().url().optional(),
  attributes: z.array(NftAttributeSchema),
  properties: z.object({
    category: z.literal("image"),
    files: z.array(
      z.object({
        uri: z.string().url(),
        type: z.string(),
      })
    ),
    creators: z.array(
      z.object({
        address: WalletAddressSchema,
        share: z.number().int().min(0).max(100),
      })
    ),
  }),
});
