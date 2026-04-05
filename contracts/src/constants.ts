/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Shared Constants                                            ║
 * ║  Numeric constants and thresholds shared across both backends.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Green Score ────────────────────────────────────────────────────────────

/** Minimum possible Green Score. */
export const GREEN_SCORE_MIN = 0;

/** Maximum possible Green Score. */
export const GREEN_SCORE_MAX = 100;

/** Weights for each component of the Green Score calculation.
 *  AI Backend computes these subcategory scores; both backends must agree
 *  on the final weighting. */
export const GREEN_SCORE_WEIGHTS = {
  transactionEfficiency: 0.25,
  spendingHabits: 0.25,
  carbonOffsets: 0.30,
  communityImpact: 0.20,
} as const;

/** Tier thresholds — maps a Green Score range to a display tier. */
export const GREEN_SCORE_TIER_THRESHOLDS = {
  seedling: { min: 0, max: 24 },
  sprout: { min: 25, max: 49 },
  tree: { min: 50, max: 74 },
  forest: { min: 75, max: 89 },
  earth_guardian: { min: 90, max: 100 },
} as const;

// ─── Staking ────────────────────────────────────────────────────────────────

/** Baseline APY for staking simulation (percent). */
export const STAKING_BASE_APY = 6.5;

/** Maximum additional APY bonus at Green Score = 100 (percent). */
export const STAKING_GREEN_BONUS_MAX = 2.5;

/** Maximum stake amount in SOL for simulation. */
export const STAKING_MAX_AMOUNT = 1_000_000;

/** Maximum staking duration in days. */
export const STAKING_MAX_DURATION_DAYS = 365;

// ─── Offset ─────────────────────────────────────────────────────────────────

/** Minimum offset amount in grams of CO₂. */
export const OFFSET_MIN_GRAMS = 1;

/** Maximum single offset amount in grams of CO₂. */
export const OFFSET_MAX_GRAMS = 1_000_000_000; // 1,000 tonnes

// ─── API Limits ─────────────────────────────────────────────────────────────

/** Default number of transactions to analyze per request. */
export const DEFAULT_TRANSACTION_LIMIT = 20;

/** Maximum number of transactions per analysis request. */
export const MAX_TRANSACTION_LIMIT = 100;

/** Number of swap suggestions the Swap Agent should return. */
export const SWAP_SUGGESTIONS_COUNT = { min: 3, max: 5 } as const;

/** Maximum leaderboard entries per page. */
export const LEADERBOARD_PAGE_SIZE = 50;

// ─── Wallet ─────────────────────────────────────────────────────────────────

/** Solana wallet address length constraints. */
export const WALLET_ADDRESS_MIN_LENGTH = 32;
export const WALLET_ADDRESS_MAX_LENGTH = 44;
