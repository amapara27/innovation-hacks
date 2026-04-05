import { clampGreenScore, getGreenScoreTier, shortenWallet } from "../lib/blockchain.js";

export const MIN_LEADERBOARD_ENTRIES = 25;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface LeaderboardSeedEntry {
  wallet: string;
  score: number;
  totalCo2eOffset: number;
}

export interface RankedLeaderboardEntry extends LeaderboardSeedEntry {
  rank: number;
  walletShort: string;
  tier: ReturnType<typeof getGreenScoreTier>;
}

function createSyntheticWallet(index: number): string {
  let value = index * 7_919 + 17;
  let wallet = "";

  for (let charIndex = 0; charIndex < 44; charIndex += 1) {
    value = (value * 48_271 + 12_345) % 2_147_483_647;
    wallet += BASE58_ALPHABET[value % BASE58_ALPHABET.length];
  }

  return wallet;
}

function createSyntheticEntry(index: number): LeaderboardSeedEntry {
  const score = clampGreenScore(Math.round(91 - index * 1.35 - (index % 3)));
  const totalCo2eOffset = 18_000 + index * 1_650 + (index % 5) * 275;
  const wallet = createSyntheticWallet(index);

  return {
    wallet,
    score,
    totalCo2eOffset,
  };
}

export function buildRankedLeaderboardEntries(
  realEntries: LeaderboardSeedEntry[],
  minimumEntries = MIN_LEADERBOARD_ENTRIES
): RankedLeaderboardEntry[] {
  const syntheticCount = Math.max(minimumEntries - realEntries.length, 0);
  const syntheticEntries = Array.from({ length: syntheticCount }, (_, index) =>
    createSyntheticEntry(index)
  );

  return [...realEntries, ...syntheticEntries]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.totalCo2eOffset - left.totalCo2eOffset ||
        left.wallet.localeCompare(right.wallet)
    )
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      walletShort: shortenWallet(entry.wallet),
      tier: getGreenScoreTier(entry.score),
    }));
}
