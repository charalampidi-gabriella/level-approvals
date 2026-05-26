# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An internal web app for Rippner Tennis where coaches log level decisions about players (approvals, denials, misplacements) so everyone shares one history instead of a scrolling chat. Replaces an ad-hoc approval chat for the gated 4.0–4.5 and 4.5 classes.

## Commands

```sh
npm run dev          # dev server at http://localhost:3000
npm run build        # production build
npm start            # serve the production build
npx tsc --noEmit     # typecheck (do this after edits; there is no test suite)
```

There are no tests and no linter configured. `npx tsc --noEmit` is the verification step — run it after changes.

## Environment

Requires Turso credentials in `.env.local` (gitignored; see `.env.example`):

```
TURSO_DATABASE_URL=libsql://...turso.io
TURSO_AUTH_TOKEN=...
```

The table is created automatically on first request — there is no migration step.

## Architecture

Next.js 15 App Router + TypeScript + Turso (libSQL). Plain CSS, no Tailwind. Four files carry essentially everything:

- **`lib/config.ts`** — the source of truth for domain options: `COACHES` (roster, type-ahead picker), `OUTCOMES` (the entry types), and `feedbackRequired(outcome)`. **This module is imported by both client and server**, so it must stay free of `"use server"` and server-only imports. Editing the roster or entry types happens here.
- **`lib/db.ts`** — lazy libSQL client + `ensureSchema()` (idempotent `CREATE TABLE IF NOT EXISTS`, cached per process) + `normalizeName()`.
- **`app/actions.ts`** — all data access, marked `"use server"`. Every exported function becomes an RPC server action. Do **not** import these helpers into client code expecting sync behavior; shared pure helpers (like `feedbackRequired`) live in `lib/config.ts` instead.
- **`app/page.tsx`** — the entire UI, one `"use client"` component with two tabs (`LogForm`, `Lookup`) plus a `CoachPicker` combobox.

### Data model — important quirks

One table, `evaluations`, one row per entry. The schema predates the current design, so column names don't match concepts:

- **`verdict` column stores the entry type** (one of `OUTCOMES`), not a yes/no. `toEval()` maps it to `outcome` for the rest of the code.
- **`level` column is written empty (`''`)** — the level is baked into the outcome string (e.g. "Approved for 4.5"), so there is no separate level field anymore.
- `status` is always `'active'` (legacy column from a removed block/resolve flow; kept for compatibility).

If you rename these columns, update `ensureSchema()`, `toEval()`, and every `INSERT`/`SELECT` together.

### Behavioral rules to preserve

- **Never blocks.** Entries always save. The form surfaces a player's existing history (yellow box on name blur) as context, but does not prevent logging. This was a deliberate product decision — coaches reconcile disagreements by talking.
- **Feedback required** for any outcome where `feedbackRequired()` is true (denials + wrong-class). Enforced in `validate()` server-side *and* in the client `onSubmit` — keep both in sync.
- **Approval summary** (`getPlayerSummary` → `standings`) only tracks the two gated levels in the `TRACKED` array. Per level it derives `Approved` / `Denied` / `Disagreement` (both present). Update `TRACKED` if the gated levels change.
- The `Lookup` tab shows the full feed (`getAllEntries`) by default and swaps to a single player's summary+history when searched.

## Deploy

Vercel. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as project env vars, then deploy. Identity is a name picker with no auth — it's a trust-based internal tool.
