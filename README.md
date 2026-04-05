# 🌱 CarbonIQ — Sustainability on Solana

**Track your carbon footprint. Stake green. Earn impact.**

CarbonIQ is a Solana-based sustainability platform that analyzes on-chain transactions for environmental impact, rewards eco-conscious behavior with boosted staking yields, and records verifiable proofs of carbon offsets on-chain.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   /web      │────▶│   /api      │────▶│   /anchor        │
│   React +   │     │   Express + │     │   Solana Program │
│   Vite      │     │   Prisma    │     │   (Rust)         │
└─────────────┘     └─────────────┘     └──────────────────┘
```

## Quick Start

```bash
# 1. Install shared + backend dependencies
cd contracts && npm install && npm run build
cd ../api && npm install

# 2. Configure and start the unified backend API
cd api && cp .env.example .env && npm run dev

# 3. Start the frontend (in another terminal, optional for backend work)
cd web && npm run dev

# 4. Verify the Anchor program compiles
cd anchor && cargo test -p carbon-iq --lib
```

## Backend Workflow

```bash
# Build shared contracts first
cd contracts && npm run build

# Build and test the unified API
cd ../api && npm run build && npm test

# Validate Prisma schema
cd ../api && DATABASE_URL='file:./dev.db' npx prisma validate

# Compile the Anchor program
cd ../anchor && cargo test -p carbon-iq --lib
```

The Express API now serves both the deterministic AI endpoints
(`/api/analyze-transactions`, `/api/green-score`, `/api/swap-suggestions`,
`/api/trigger-offset`) and the blockchain endpoints
(`/api/record-offset`, `/api/staking-info`, `/api/simulate-stake`,
`/api/stake`, `/api/leaderboard`, `/api/nft-metadata`).

The Solana/Anchor side is configured for devnet in `anchor/Anchor.toml`, and
the API expects the server-authority signing model via `SOLANA_PROGRAM_ID`,
`SOLANA_RPC_URL`, `SOLANA_PAYER_SECRET_KEY`, and
`SOLANA_STAKING_VAULT_ADDRESS` in `api/.env`.

Staking execution can now be selected with:
- `SOLANA_STAKING_PROVIDER=marinade|demo|jito` (default: `marinade`)
- `SOLANA_STAKING_FALLBACK_TO_DEMO=true|false` (default: `true`)
- `MARINADE_HARDCODED_APY=<number>` (default: `6.1`)
- `STAKING_PROTOCOL_APY_WINDOW_DAYS=<days>` (default: `14`)

When `marinade` is selected, `/api/stake` uses Marinade protocol deposit and
stores the resulting destination token account address in the existing
`vaultAddress` response field for backward compatibility.

`GET /api/staking-info` and `POST /api/simulate-stake` now use a protocol-first
base APY model:
- first preference: rolling APY derived from Marinade `mSOL` on-chain price snapshots
- fallback: `MARINADE_HARDCODED_APY`

Optional AI swap-suggestion
narration can be enabled with `CARBONIQ_USE_OPENAI_NARRATOR` plus the
`OPENAI_*` variables in `api/.env`.

## Tech Stack

| Layer      | Technology                                         |
|------------|----------------------------------------------------|
| Frontend   | React 19, Vite, TypeScript, Tailwind CSS, Recharts |
| Auth       | Clerk + Solana Wallet Adapter                      |
| Blockchain | Solana (Anchor 0.30, Rust)                         |
| Backend    | Express.js, Prisma ORM, Zod                        |
| Database   | SQLite (dev) → PostgreSQL (prod)                   |

## License

MIT
