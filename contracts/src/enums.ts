/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Shared Enums                                                ║
 * ║  Source of truth for all categorical values across both backends.        ║
 * ║  AI Backend (Python) should mirror these exact string values.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── Transaction / Emission Categories ──────────────────────────────────────

/** MCC-derived spending categories used by the Footprint Agent. */
export const EmissionCategory = {
  TRANSPORTATION: "transportation",
  FOOD_DINING: "food_dining",
  GROCERIES: "groceries",
  UTILITIES: "utilities",
  SHOPPING: "shopping",
  TRAVEL: "travel",
  GAS_FUEL: "gas_fuel",
  HOME: "home",
  ENTERTAINMENT: "entertainment",
  HEALTH: "health",
  OTHER: "other",
} as const;
export type EmissionCategory =
  (typeof EmissionCategory)[keyof typeof EmissionCategory];

// ─── Carbon Credit Types ────────────────────────────────────────────────────

/** Credit types for offsets — must match what the Offset Agent produces
 *  AND what we record on-chain in the Proof-of-Impact program. */
export const CarbonCreditType = {
  RENEWABLE_ENERGY: "renewable_energy",
  FORESTRY: "forestry",
  METHANE_CAPTURE: "methane_capture",
  DIRECT_AIR_CAPTURE: "direct_air_capture",
  SOIL_CARBON: "soil_carbon",
  OCEAN_BASED: "ocean_based",
} as const;
export type CarbonCreditType =
  (typeof CarbonCreditType)[keyof typeof CarbonCreditType];

// ─── Offset Status ──────────────────────────────────────────────────────────

/** Lifecycle status of an offset purchase/recording. */
export const OffsetStatus = {
  PENDING: "pending",
  PURCHASED: "purchased",
  RECORDED_ON_CHAIN: "recorded_on_chain",
  FAILED: "failed",
} as const;
export type OffsetStatus = (typeof OffsetStatus)[keyof typeof OffsetStatus];

// ─── Green Score Tier ───────────────────────────────────────────────────────

/** Display-only tier derived from the continuous Green Score (0–100).
 *  The staking multiplier uses a continuous curve, NOT these tiers. */
export const GreenScoreTier = {
  SEEDLING: "seedling",       // 0–24
  SPROUT: "sprout",           // 25–49
  TREE: "tree",               // 50–74
  FOREST: "forest",           // 75–89
  EARTH_GUARDIAN: "earth_guardian", // 90–100
} as const;
export type GreenScoreTier =
  (typeof GreenScoreTier)[keyof typeof GreenScoreTier];

// ─── NFT Rarity ─────────────────────────────────────────────────────────────

/** Impact NFT rarity levels for Metaplex-compatible metadata. */
export const NftRarity = {
  COMMON: "common",
  UNCOMMON: "uncommon",
  RARE: "rare",
  EPIC: "epic",
  LEGENDARY: "legendary",
} as const;
export type NftRarity = (typeof NftRarity)[keyof typeof NftRarity];
