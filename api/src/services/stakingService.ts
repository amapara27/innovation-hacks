/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Staking Service                                             ║
 * ║  Continuous yield curve from Green Score. No tiers.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import type { SimulateStakeResponse } from "@carboniq/contracts";
import {
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";

/**
 * Compute the green bonus APY using a continuous power curve.
 * Formula: bonus = maxBonus × (score/100)^1.5
 *
 * This rewards higher green scores disproportionately:
 *   Score 25  → 0.31% bonus
 *   Score 50  → 0.88% bonus
 *   Score 75  → 1.62% bonus
 *   Score 100 → 2.50% bonus
 */
export function computeGreenBonus(greenScore: number): number {
  const normalized = Math.max(0, Math.min(100, greenScore)) / 100;
  return STAKING_GREEN_BONUS_MAX * Math.pow(normalized, 1.5);
}

/**
 * Compute the total effective APY (base + green bonus).
 */
export function computeEffectiveApy(greenScore: number): number {
  return computeEffectiveApyWithBase(greenScore, STAKING_BASE_APY);
}

export function computeEffectiveApyWithBase(
  greenScore: number,
  baseApy: number
): number {
  return baseApy + computeGreenBonus(greenScore);
}

/**
 * Simulate a stake and return projected yield.
 */
export function simulateStake(
  principal: number,
  durationDays: number,
  greenScore: number,
  baseApy: number = STAKING_BASE_APY
): SimulateStakeResponse {
  const greenBonus = computeGreenBonus(greenScore);
  const effectiveApy = baseApy + greenBonus;
  const estimatedYield =
    principal * (effectiveApy / 100) * (durationDays / 365);

  return {
    principal,
    durationDays,
    baseApy: parseFloat(baseApy.toFixed(4)),
    greenBonus: parseFloat(greenBonus.toFixed(4)),
    effectiveApy: parseFloat(effectiveApy.toFixed(4)),
    estimatedYield: parseFloat(estimatedYield.toFixed(6)),
    totalReturn: parseFloat((principal + estimatedYield).toFixed(6)),
  };
}
