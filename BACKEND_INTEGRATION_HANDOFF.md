# CarbonIQ Backend Integration Handoff

Last updated: April 5, 2026

This document is for the frontend/integration developer or their coding agent. It summarizes what is already implemented in the backend, what is live versus mocked, and how the frontend should connect to it.

## Scope

- The backend is unified under the TypeScript Express app in `api/`.
- Shared request/response contracts live in `contracts/` and are the source of truth for frontend integration.
- The Solana Anchor program lives in `anchor/`.
- Frontend work should integrate with the existing backend surface, not redesign the API unless a real bug is found.

## High-Level Status

- AI routes and blockchain routes are mounted in one backend server.
- Contract validation is in place on backend request and response boundaries.
- Green Score, staking, leaderboard, NFT metadata, and offset history all use the same persisted user data in Prisma.
- Offset recording writes to Solana devnet through the API server wallet.
- Staking execution supports protocol-backed devnet staking via Marinade (default) with automatic fallback to demo transfer when configured.
- Frontend does not need to sign Solana transactions for staking or offset recording in the current model.

## Main Backend Entry Points

- Unified app router: `api/src/app.ts`
- Shared route map: `contracts/src/routes.ts`
- Shared schemas/types: `contracts/src/schemas.ts`, `contracts/src/types.ts`, `contracts/src/index.ts`
- Prisma data model: `api/prisma/schema.prisma`
- Solana service: `api/src/services/solanaService.ts`
- Live staking execution service: `api/src/services/stakeExecutionService.ts`
- Offset recording service: `api/src/services/recordOffsetService.ts`
- AI-triggered offset orchestration: `api/src/services/triggerOffsetService.ts`
- Green Score persistence/service: `api/src/services/greenScoreService.ts`

## Mounted API Routes

The backend mounts these routes in `api/src/app.ts`.

- `GET /api/health`
- `POST /api/analyze-transactions`
- `GET /api/green-score`
- `GET /api/swap-suggestions`
- `POST /api/trigger-offset`
- `POST /api/simulate-stake`
- `POST /api/stake`
- `GET /api/staking-info`
- `POST /api/record-offset`
- `GET /api/leaderboard`
- `GET /api/nft-metadata`

## Source Of Truth For Payloads

Frontend code should use `@carboniq/contracts` for request and response shapes.

- Route map: `contracts/src/routes.ts`
- Zod schemas: `contracts/src/schemas.ts`
- TS types: `contracts/src/types.ts`

Do not hardcode payload shapes in the frontend if you can avoid it.

## Endpoint Summary

### AI / analysis endpoints

- `POST /api/analyze-transactions`
  - Request: `{ wallet, plaidAccessToken?, limit? }`
  - Response includes `transactionCount`, `totalCo2eGrams`, `categoryBreakdown`, `transactions`, `analyzedAt`
  - Current behavior is deterministic/demo-backed, not live Plaid

- `GET /api/green-score?wallet=<address>`
  - Response includes `wallet`, `score`, `tier`, `breakdown`, optional `rank`, optional `totalUsers`
  - This also persists/refreshed the stored Green Score in the DB

- `GET /api/swap-suggestions?wallet=<address>&categories=...`
  - Response includes a list of up to 5 suggestions and `totalPotentialSavingsMonthly`
  - Current behavior is deterministic/demo-backed

### Offset endpoints

- `POST /api/trigger-offset`
  - Request: `{ wallet, budgetUsd, preferredCreditType? }`
  - This is the main frontend endpoint for the offset flow
  - It computes the offset decision, then calls the blockchain record flow
  - Response includes:
    - `wallet`
    - `decision`
    - `status`
    - `toucanTxHash`
  - It can return `422` for business-rule failures such as no outstanding emissions or too-small budget

- `POST /api/record-offset`
  - Request: `{ wallet, co2eGrams, creditType, toucanTxHash? }`
  - This is the lower-level blockchain write endpoint
  - Use this only if the frontend needs a direct/manual offset-recording flow
  - Response includes:
    - `wallet`
    - `solanaSignature`
    - `proofOfImpactAddress`
    - `cumulativeCo2eGrams`
    - `status`

### Staking endpoints

- `POST /api/simulate-stake`
  - Request: `{ amount, durationDays, greenScore }`
  - Pure math simulation only
  - No chain write

- `POST /api/stake`
  - Request: `{ wallet, amount, durationDays }`
  - This is a real devnet staking execution route
  - Default behavior uses Marinade on devnet via the API signer wallet
  - If Marinade execution fails and fallback is enabled, it falls back to a direct demo transfer to the configured vault wallet
  - Response includes:
    - `wallet`
    - `amount`
    - `durationDays`
    - `greenScore`
    - `effectiveApy`
    - `estimatedYield`
    - `vaultAddress` (backward-compatible destination field; protocol mode stores the destination token account address)
    - `solanaSignature`
    - `status`

- `GET /api/staking-info?wallet=<address>`
  - Response includes:
    - `wallet`
    - `greenScore`
    - `baseApy`
    - `greenBonus`
    - `effectiveApy`
    - `stakedAmount`
    - `accruedYield`
  - Important: this aggregates only confirmed executed stake rows, not legacy simulated rows
  - Base APY is protocol-first:
    - Uses Marinade-derived rolling APY from on-chain `mSOL` price snapshots when available
    - Falls back to configured `MARINADE_HARDCODED_APY` if a rolling value is not yet computable

### Read-model endpoints

- `GET /api/leaderboard?page=1&pageSize=20`
  - Response includes paginated ranked entries with:
    - `rank`
    - `wallet`
    - `walletShort`
    - `score`
    - `tier`
    - `totalCo2eOffset`

- `GET /api/nft-metadata?wallet=<address>`
  - Returns Metaplex-compatible metadata for a known user
  - Returns `404` if the wallet has no user row yet
  - Current image URI is a placeholder hackathon asset

## Backend Data Model

Prisma schema: `api/prisma/schema.prisma`

- `User`
  - `walletAddress`
  - `greenScore`

- `ImpactRecord`
  - Stores each offset event
  - Includes `co2OffsetGrams`, `creditType`, `toucanTxHash`, `onChainTxHash`, `proofPda`, `status`

- `StakeRecord`
  - Stores stake simulation/execution history
  - Executed devnet stake rows include:
    - `solanaTxHash`
    - `vaultAddress`
    - `status = "confirmed"`
  - Legacy/mock rows may exist with `status = "simulated"` and no tx hash

## Important Integration Behavior

- The frontend should pass only the user wallet address to the backend.
- The frontend does not need to sign staking or offset transactions in the current model.
- The API server is the authority signer for:
  - Anchor proof-of-impact writes
  - Devnet staking execution (Marinade protocol mode or demo transfer fallback)
- `POST /api/trigger-offset` is the higher-level UX-friendly offset endpoint.
- `POST /api/stake` is the higher-level staking execution endpoint.
- `POST /api/simulate-stake` is still useful for previews before calling `POST /api/stake`.
- `GET /api/green-score` should be treated as both a read endpoint and a refresh endpoint for the stored score.

## What Is Live vs Demo

Live:

- Solana proof-of-impact writes in `/api/record-offset`
- Real staking execution in `/api/stake` (Marinade by default, demo transfer fallback supported)
- Prisma persistence for users, impacts, stakes
- Leaderboard and staking-info backed by DB state

Demo or deterministic:

- Transaction analysis currently uses deterministic synthetic analysis, not real Plaid
- Swap suggestions are deterministic/demo-backed
- Toucan retirement is mocked
- NFT metadata image/external URL values are still placeholder-style hackathon metadata

## Verified Backend Status

These checks have been run successfully:

- `cd contracts && npm run build`
- `cd api && npm run db:generate`
- `cd api && npm run build`
- `cd api && npm test`
- `cd api && DATABASE_URL='file:./dev.db' npx prisma validate`

Live devnet verification that has already been completed:

- A real `POST /api/stake`-equivalent backend execution succeeded on April 5, 2026
- Example wallet used for verification:
  - `EQVnRjRNDmVcSN2qAn2ApfsHaeevX9s1uWmNZwV4KH6q`
- Example vault:
  - `6t8k9rMrgAoPnwnLUCDS2n7D5s8JbSs1E1X7tyEmEUc`
- Example confirmed devnet signature:
  - `4zJUeSbhoWnKvtZeiALYKFwYpcH5VP5gDFaEv9g5oBM7t6AjHc9dPLeojr1EnPmXvAjSNfGC1TMvxFx2QfihumWB`
- Explorer URL:
  - `https://explorer.solana.com/tx/4zJUeSbhoWnKvtZeiALYKFwYpcH5VP5gDFaEv9g5oBM7t6AjHc9dPLeojr1EnPmXvAjSNfGC1TMvxFx2QfihumWB?cluster=devnet`

## Backend Env Vars The Frontend Dev Should Know Exist

Backend env file: `api/.env`

- `PORT`
- `FRONTEND_URL`
- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `SOLANA_PROGRAM_ID`
- `SOLANA_PAYER_SECRET_KEY`
- `SOLANA_STAKING_VAULT_ADDRESS`
- `SOLANA_STAKING_PROVIDER` (`marinade`, `demo`, `jito`)
- `SOLANA_STAKING_FALLBACK_TO_DEMO` (`true`/`false`)
- `MARINADE_HARDCODED_APY` (default fallback base APY)
- `STAKING_PROTOCOL_APY_WINDOW_DAYS` (snapshot window for annualized APY)
- `CARBONIQ_USE_OPENAI_NARRATOR`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `CARBONIQ_OPENAI_MODEL`
- `CARBONIQ_HTTP_TIMEOUT_SECONDS`

The frontend does not need these secrets, but it should know the backend is already configured around them.

## Notes For The Frontend/Coding Agent

- Prefer integrating against `@carboniq/contracts` instead of manually recreating endpoint types.
- Do not build a wallet-signing flow for offset recording or staking unless the backend model is intentionally changed later.
- Use `POST /api/trigger-offset` for the main offset CTA.
- Use `POST /api/simulate-stake` for previews and `POST /api/stake` for the actual stake CTA.
- After a successful offset or stake call, refresh:
  - `GET /api/green-score`
  - `GET /api/staking-info`
  - `GET /api/leaderboard`
  - `GET /api/nft-metadata` when relevant
- Surface backend validation and business-rule errors in the UI.
- For successful staking, show the returned `solanaSignature` and link it to Solana Explorer on devnet.
- For successful offset recording, show the returned `solanaSignature` and `proofOfImpactAddress`.

## Likely Frontend Wiring Tasks

- Replace any mock frontend staking calls with:
  - preview via `POST /api/simulate-stake`
  - execute via `POST /api/stake`

- Replace any mock frontend offset flow with:
  - `POST /api/trigger-offset`
  - optional advanced/manual path via `POST /api/record-offset`

- Replace any mock score/leaderboard/NFT reads with:
  - `GET /api/green-score`
  - `GET /api/staking-info`
  - `GET /api/leaderboard`
  - `GET /api/nft-metadata`

- Ensure the wallet public key is consistently passed as the `wallet` field or query param expected by each route.

## Non-Goals For Frontend Integration

- Do not touch `anchor/` unless a true backend bug is found.
- Do not introduce a separate AI backend process; AI routes are already inside the unified API.
- Do not assume Plaid or Toucan are live integrations yet.
- Do not assume staking is user-signed wallet staking from the frontend; staking is currently backend-signed and protocol/provider-configured.
