# Rippner Level Approvals

A shared log of what coaches observe and decide about players' levels, so:

- every coach can **see what's already been said** about a player before they act;
- decisions and observations are recorded with who, when, and why;
- the **front desk can look up** any player's standing at signup.

Stack: Next.js 15 (App Router) + TypeScript + Turso (libSQL). The database is the single source of truth.

## How it works

1. Coach picks their name (type-ahead), the player, the level it's about, and **what they're logging**:
   - **Approved for this level** — cleared to play up.
   - **Not ready / denied** — asked for a level, not ready.
   - **Wrong level / misplaced** — showed up to a class they don't belong in.
   - **Suggested placement / note** — where they think the player belongs, or any observation.
2. As soon as the player's name is entered, **existing history surfaces** so the coach sees prior entries before logging. Nothing is blocked — entries always save; coaches reconcile disagreements by talking.
3. **Look up player** shows a per-level summary (Cleared / Not ready / Misplaced / Disagreement / Note only) plus the full chronological history.

## Setup

1. **Create the Turso database** (one time):
   ```sh
   turso db create rippner-approvals
   turso db show rippner-approvals --url        # -> TURSO_DATABASE_URL
   turso db tokens create rippner-approvals     # -> TURSO_AUTH_TOKEN
   ```
2. **Add credentials.** Copy `.env.example` to `.env.local` and fill in both values. The table is created automatically on first request — no migration step.
3. **Run locally:**
   ```sh
   npm install
   npm run dev      # http://localhost:3000
   ```

## Deploy (Vercel)

```sh
vercel
```
Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the Vercel project's environment variables, then redeploy. Share the URL with coaches — it's phone-friendly.

## Editing the roster / levels

Coaches and level bands live in `lib/config.ts`. Edit the arrays and redeploy.

## Notes

- Identity is a name picker (no passwords) — internal trust-based tool.
- To inspect or fix data directly: `turso db shell rippner-approvals` then `SELECT * FROM evaluations;`.
- Entry types live in `lib/config.ts` (`OUTCOMES` / `OUTCOME_LABELS`).
