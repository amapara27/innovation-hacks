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

# 2. Configure and start the blockchain API
cd api && cp .env.example .env && npm run dev

# 3. Start the frontend (in another terminal, optional for backend work)
cd web && npm run dev

# 4. Verify the Anchor program compiles
cd anchor && cargo test -p carbon-iq --lib
```

## Blockchain Backend Workflow

```bash
# Build shared contracts first
cd contracts && npm run build

# Build and test the blockchain API
cd ../api && npm run build && npm test

# Validate Prisma schema
cd ../api && DATABASE_URL='file:./dev.db' npx prisma validate

# Compile the Anchor program
cd ../anchor && cargo test -p carbon-iq --lib
```

The Solana/Anchor backend is configured for devnet in `anchor/Anchor.toml`, and
the API expects the server-authority signing model via `SOLANA_PROGRAM_ID`,
`SOLANA_RPC_URL`, and `SOLANA_PAYER_SECRET_KEY` in `api/.env`.

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
