import { createClient, type Client } from "@libsql/client";

let _client: Client | null = null;
let _schemaReady: Promise<void> | null = null;

export function db(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error("TURSO_DATABASE_URL is not set");
    _client = createClient({ url, authToken });
  }
  return _client;
}

/** Create the table + index once per process. Safe to call on every request. */
export function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const client = db();
      await client.execute(`
        CREATE TABLE IF NOT EXISTS evaluations (
          id             TEXT PRIMARY KEY,
          created_at     TEXT NOT NULL,
          player         TEXT NOT NULL,
          player_norm    TEXT NOT NULL,
          level          TEXT NOT NULL,
          verdict        TEXT NOT NULL,
          coach          TEXT NOT NULL,
          note           TEXT,
          status         TEXT NOT NULL DEFAULT 'active',
          attended_level TEXT NOT NULL DEFAULT '',
          correct_level  TEXT NOT NULL DEFAULT '',
          confident      INTEGER NOT NULL DEFAULT 0
        )
      `);
      // Add columns for DBs created before wrong-class levels existed.
      // SQLite has no "ADD COLUMN IF NOT EXISTS"; ignore the duplicate error.
      for (const col of ["attended_level", "correct_level"]) {
        try {
          await client.execute(
            `ALTER TABLE evaluations ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`
          );
        } catch {
          /* column already exists */
        }
      }
      // `confident` (0/1): whether the coach was 100% sure. Drives the pending
      // list — a player clears once a confident decision exists. Added later, so
      // back-fill on older DBs; legacy rows default to 0 (treated as tentative).
      try {
        await client.execute(
          `ALTER TABLE evaluations ADD COLUMN confident INTEGER NOT NULL DEFAULT 0`
        );
      } catch {
        /* column already exists */
      }
      await client.execute(
        `CREATE INDEX IF NOT EXISTS idx_eval_player_norm ON evaluations (player_norm)`
      );
    })().catch((e) => {
      _schemaReady = null; // allow retry on next call
      throw e;
    });
  }
  return _schemaReady;
}

export function normalizeName(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
