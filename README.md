# Factory

Workflow-based factory management for a Ugandan plastics/packaging factory (straws, sticks, foil, cling film, plates & lids). All money is UGX.

**Flow:** Customer → Sales Order → BOM material check → Purchase Request → approval → Purchase → Goods Received → Production (standard vs actual consumption = variance) → Invoice → Payments (AR).

Next.js 16 · Drizzle + Neon Postgres · Better Auth · Tailwind v4 · Iconsax · realtime via Postgres NOTIFY → SSE.

## Local setup

```bash
npm install
cp .env.example .env        # fill in Neon URLs + auth secret
npm run db:push             # create tables
npm run db:seed             # masters, BOM, opening stock, roles, admin user
npm run dev
```

Seed admin: `admin@factory.local` / `admin1234` — change the password after first sign-in (Users page).

## Deploy to Vercel

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework is auto-detected (Next.js); no build settings needed.
3. Under **Environment Variables**, add the four values from `.env.example`:
   - `DATABASE_URL` — Neon **pooled** connection string
   - `DATABASE_URL_UNPOOLED` — Neon **direct** connection string (host without `-pooler`)
   - `BETTER_AUTH_SECRET` — a fresh random hex string for production
   - `BETTER_AUTH_URL` — `https://<your-app>.vercel.app` (set after the first deploy, then redeploy)
4. Deploy. Run `npm run db:push && npm run db:seed` once from your machine (they run against Neon directly, no Vercel involvement).

Realtime note: on Vercel the SSE stream reopens every few minutes (function `maxDuration`); the client reconnects automatically, so live updates keep working.

## Scripts

| Command | What it does |
|---|---|
| `npm run db:push` | Sync Drizzle schema to the database |
| `npm run db:seed` | Seed masters, BOM, opening stock, roles, admin |
| `node scripts/e2e.mjs` | Playwright walk of the full workflow (needs `npm run dev` running) |
| `node scripts/check-ledger.mjs` | Assert ledger Σin − Σout = current stock for every item |
| `node scripts/reset-transactions.mjs` | Wipe all transactions back to opening stock (keeps masters/users) |

Conventions for contributors (and AI agents) live in `AGENTS.md`.
