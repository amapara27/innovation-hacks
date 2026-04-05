/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  CarbonIQ — API Route Map                                               ║
 * ║  Single source of truth for all endpoint paths, HTTP methods,           ║
 * ║  and ownership (which backend is responsible).                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

export const API_ROUTES = {
  /** Health check — shared / gateway. */
  HEALTH: {
    path: "/api/health",
    method: "GET" as const,
    owner: "shared" as const,
  },

  // ─── AI Backend (Partner) ───────────────────────────────────────────────

  /** Footprint Agent: analyze Plaid transactions → CO₂e per transaction. */
  ANALYZE_TRANSACTIONS: {
    path: "/api/analyze-transactions",
    method: "POST" as const,
    owner: "ai" as const,
  },

  /** Demo-only bank-link endpoint for preset/upload transaction ingestion. */
  DEMO_CONNECT_BANK: {
    path: "/api/demo/connect-bank",
    method: "POST" as const,
    owner: "ai" as const,
  },

  /** Green Score: composite sustainability score for a wallet. */
  GREEN_SCORE: {
    path: "/api/green-score",
    method: "GET" as const,
    owner: "ai" as const,
  },

  /** Swap Agent: lower-emission alternatives for user's top categories. */
  SWAP_SUGGESTIONS: {
    path: "/api/swap-suggestions",
    method: "GET" as const,
    owner: "ai" as const,
  },

  RECOMMENDATION_ACTIONS: {
    path: "/api/recommendation-actions",
    method: "POST" as const,
    owner: "ai" as const,
  },

  WALLET_STATE: {
    path: "/api/wallet-state",
    method: "GET" as const,
    owner: "shared" as const,
  },

  /** Offset Agent: decide credit type + amount, mock Toucan purchase. */
  TRIGGER_OFFSET: {
    path: "/api/trigger-offset",
    method: "POST" as const,
    owner: "ai" as const,
  },

  // ─── Blockchain Backend (You) ───────────────────────────────────────────

  /** Write proof-of-impact to Solana devnet after offset is triggered. */
  RECORD_OFFSET: {
    path: "/api/record-offset",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Get staking info for a wallet (yield boost from Green Score). */
  STAKING_INFO: {
    path: "/api/staking-info",
    method: "GET" as const,
    owner: "blockchain" as const,
  },

  /** Simulate staking yield with green score bonus. */
  SIMULATE_STAKE: {
    path: "/api/simulate-stake",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Simulate timeline impact from sustained low Green Scores. */
  SIMULATE_STAKE_TIMELINE: {
    path: "/api/simulate-stake-timeline",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Execute a real demo stake transfer on devnet. */
  STAKE: {
    path: "/api/stake",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Collect accrued staking yield. */
  STAKE_COLLECT: {
    path: "/api/stake/collect",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Withdraw staked principal. */
  STAKE_WITHDRAW: {
    path: "/api/stake/withdraw",
    method: "POST" as const,
    owner: "blockchain" as const,
  },

  /** Green Score leaderboard from stored scores. */
  LEADERBOARD: {
    path: "/api/leaderboard",
    method: "GET" as const,
    owner: "blockchain" as const,
  },

  /** Impact NFT metadata (Metaplex-compatible). */
  NFT_METADATA: {
    path: "/api/nft-metadata",
    method: "GET" as const,
    owner: "blockchain" as const,
  },
} as const;

/** All route paths as a union type. */
export type ApiRoutePath = (typeof API_ROUTES)[keyof typeof API_ROUTES]["path"];

/** Route owners. */
export type ApiRouteOwner = (typeof API_ROUTES)[keyof typeof API_ROUTES]["owner"];
