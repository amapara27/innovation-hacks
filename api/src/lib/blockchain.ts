import {
  CarbonCreditType,
  GREEN_SCORE_MAX,
  GREEN_SCORE_MIN,
  GREEN_SCORE_TIER_THRESHOLDS,
  GreenScoreTier,
  NftRarity,
} from "@carboniq/contracts";

type GreenScoreTierValue =
  (typeof GreenScoreTier)[keyof typeof GreenScoreTier];
type NftRarityValue = (typeof NftRarity)[keyof typeof NftRarity];
type CarbonCreditTypeValue =
  (typeof CarbonCreditType)[keyof typeof CarbonCreditType];

export function clampGreenScore(score: number): number {
  return Math.max(GREEN_SCORE_MIN, Math.min(GREEN_SCORE_MAX, Math.round(score)));
}

export function getGreenScoreTier(score: number): GreenScoreTierValue {
  const clamped = clampGreenScore(score);

  if (clamped >= GREEN_SCORE_TIER_THRESHOLDS.earth_guardian.min) {
    return GreenScoreTier.EARTH_GUARDIAN;
  }
  if (clamped >= GREEN_SCORE_TIER_THRESHOLDS.forest.min) {
    return GreenScoreTier.FOREST;
  }
  if (clamped >= GREEN_SCORE_TIER_THRESHOLDS.tree.min) {
    return GreenScoreTier.TREE;
  }
  if (clamped >= GREEN_SCORE_TIER_THRESHOLDS.sprout.min) {
    return GreenScoreTier.SPROUT;
  }

  return GreenScoreTier.SEEDLING;
}

export function getNftRarity(score: number): NftRarityValue {
  const clamped = clampGreenScore(score);

  if (clamped >= 90) {
    return NftRarity.LEGENDARY;
  }
  if (clamped >= 75) {
    return NftRarity.EPIC;
  }
  if (clamped >= 50) {
    return NftRarity.RARE;
  }
  if (clamped >= 25) {
    return NftRarity.UNCOMMON;
  }

  return NftRarity.COMMON;
}

export function shortenWallet(wallet: string): string {
  if (wallet.length <= 8) {
    return wallet;
  }

  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

export function titleCaseIdentifier(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function computeOffsetGreenScoreDelta(co2eGrams: number): number {
  return Math.max(1, Math.min(5, Math.floor(co2eGrams / 1_000)));
}

export function listCarbonCreditTypes(): CarbonCreditTypeValue[] {
  return [
    CarbonCreditType.RENEWABLE_ENERGY,
    CarbonCreditType.FORESTRY,
    CarbonCreditType.METHANE_CAPTURE,
    CarbonCreditType.DIRECT_AIR_CAPTURE,
    CarbonCreditType.SOIL_CARBON,
    CarbonCreditType.OCEAN_BASED,
  ];
}
