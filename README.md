# Clipping Marketplace

A cut-down version of a paid clipping marketplace. Brands run campaigns, creators submit
short-form clips, and approved clips are paid per 1,000 views up to the campaign budget.

Built for a take-home assignment. **[NOTES.md](./NOTES.md)** covers the design decisions —
how concurrent approvals are handled, what was left out, and why.

## Stack

Next.js 15 (App Router) · TypeScript strict · tRPC v11 · Drizzle ORM on Postgres 17 ·
TailwindCSS + shadcn/ui · react-hook-form + Zod · Vitest

## Running it

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000 and pick a user from the switcher in the top right. There is no
sign-in by design; see NOTES.md.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm test` | Vitest against a real Postgres |
| `pnpm ingest [YYYY-MM-DD]` | Fake a daily metrics sync; safe to run twice |
| `pnpm db:generate` | Generate a migration from the schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Reset and reseed the database |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
