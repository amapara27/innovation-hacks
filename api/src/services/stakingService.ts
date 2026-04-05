/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Staking Service                                             ║
 * ║  Continuous yield curve from Green Score. No tiers.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import type {
  SimulateStakeResponse,
  SimulateStakeTimelineResponse,
} from "@carboniq/contracts";
import {
  STAKING_BASE_APY,
  STAKING_GREEN_BONUS_MAX,
} from "@carboniq/contracts";
import { roundTo } from "../lib/aiMath.js";

const SOFT_DECAY_SCORE_THRESHOLD = 45;
const HARD_RESET_SCORE_THRESHOLD = 25;
const SOFT_DECAY_START_DAY = 8;
const SOFT_DECAY_PER_DAY = 0.08;
const SOFT_DECAY_FLOOR = 0.1;
const HARD_RESET_DAY = 14;

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

export function simulateStakeTimeline(
  principal: number,
  currentAccruedYield: number,
  greenScore: number,
  horizonDays: number,
  baseApy: number = STAKING_BASE_APY
): SimulateStakeTimelineResponse {
  const effectiveApy = computeEffectiveApyWithBase(greenScore, baseApy);
  const baselineDailyAccrual = principal * (effectiveApy / 100) / 365;
  const isLowScore = greenScore < SOFT_DECAY_SCORE_THRESHOLD;
  const hasHardResetRisk = greenScore <= HARD_RESET_SCORE_THRESHOLD;

  const events: SimulateStakeTimelineResponse["events"] = [];
  if (isLowScore && horizonDays >= SOFT_DECAY_START_DAY) {
    events.push({
      day: SOFT_DECAY_START_DAY,
      type: "soft_decay_started",
      description:
        "Low-score streak triggered yield decay after day 7.",
    });
  }
  if (hasHardResetRisk && horizonDays >= HARD_RESET_DAY) {
    events.push({
      day: HARD_RESET_DAY,
      type: "hard_reset_triggered",
      description:
        "Sustained low score triggered accrued-yield reset on day 14.",
    });
  }

  let baselineAccrued = roundTo(Math.max(0, currentAccruedYield), 6);
  let projectedAccrued = roundTo(Math.max(0, currentAccruedYield), 6);
  let hardResetApplied = false;

  const points: SimulateStakeTimelineResponse["points"] = [
    {
      day: 0,
      projectedAccruedYield: projectedAccrued,
      baselineAccruedYield: baselineAccrued,
      multiplier: 1,
    },
  ];

  for (let day = 1; day <= horizonDays; day += 1) {
    baselineAccrued = roundTo(baselineAccrued + baselineDailyAccrual, 6);

    let multiplier = 1;
    if (isLowScore && day >= SOFT_DECAY_START_DAY) {
      multiplier = Math.max(
        SOFT_DECAY_FLOOR,
        roundTo(1 - (day - 7) * SOFT_DECAY_PER_DAY, 4)
      );
    }

    projectedAccrued = roundTo(
      projectedAccrued + baselineDailyAccrual * multiplier,
      6
    );

    if (hasHardResetRisk && day >= HARD_RESET_DAY && !hardResetApplied) {
      projectedAccrued = 0;
      hardResetApplied = true;
    }

    points.push({
      day,
      projectedAccruedYield: projectedAccrued,
      baselineAccruedYield: baselineAccrued,
      multiplier: roundTo(multiplier, 4),
    });
  }

  const earningsDelta = roundTo(projectedAccrued - baselineAccrued, 6);

  return {
    horizonDays,
    projectedAccruedYield: projectedAccrued,
    baselineAccruedYield: baselineAccrued,
    earningsDelta,
    events,
    points,
  };
}
