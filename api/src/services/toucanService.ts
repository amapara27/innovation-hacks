/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — Mock Toucan Service                                         ║
 * ║  Simulates Toucan Protocol credit retirement on Polygon.                ║
 * ║  Replace with real Toucan SDK calls for production.                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

import { CarbonCreditType } from "@carboniq/contracts";

type CarbonCreditTypeValue =
  (typeof CarbonCreditType)[keyof typeof CarbonCreditType];

/**
 * Simulates a Toucan Protocol carbon credit retirement transaction.
 * In production, this would call the Toucan SDK to retire credits
 * on Polygon and return a real transaction hash.
 */
export async function mockRetireCarbonCredits(
  creditType: CarbonCreditTypeValue,
  co2eGrams: number,
  projectName: string
): Promise<{
  toucanTxHash: string;
  retiredAt: string;
  projectName: string;
  creditType: string;
  co2eGrams: number;
}> {
  // Simulate network delay (200–500ms)
  const delay = 200 + Math.floor(Math.random() * 300);
  await new Promise((r) => setTimeout(r, delay));

  // Generate a mock Polygon transaction hash
  const hash =
    "0x" +
    Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");

  return {
    toucanTxHash: hash,
    retiredAt: new Date().toISOString(),
    projectName,
    creditType,
    co2eGrams,
  };
}

/**
 * Maps a credit type string to a mock project name.
 */
export function getProjectForCreditType(creditType: string): string {
  const projects: Record<CarbonCreditTypeValue, string> = {
    [CarbonCreditType.RENEWABLE_ENERGY]: "Gujarat Solar Farm - India",
    [CarbonCreditType.FORESTRY]: "Amazon Rainforest Conservation - Brazil",
    [CarbonCreditType.METHANE_CAPTURE]:
      "Landfill Methane Capture - California",
    [CarbonCreditType.DIRECT_AIR_CAPTURE]: "Climeworks DAC - Iceland",
    [CarbonCreditType.SOIL_CARBON]: "Regenerative Agriculture - Kenya",
    [CarbonCreditType.OCEAN_BASED]: "Kelp Forest Restoration - Norway",
  };

  return (
    projects[creditType as CarbonCreditTypeValue] ??
    "General Carbon Offset Project"
  );
}
