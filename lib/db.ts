import { createClient, type Client } from "@libsql/client";
import { PENDING_EVALUATION } from "./config";

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
          correct_level  TEXT NOT NULL DEFAULT ''
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
      await client.execute(
        `CREATE INDEX IF NOT EXISTS idx_eval_player_norm ON evaluations (player_norm)`
      );

      // Manager-editable pending-evaluation roster + a tiny key/value table used
      // to record one-time bootstraps.
      await client.execute(`
        CREATE TABLE IF NOT EXISTS pending_players (
          name       TEXT NOT NULL,
          name_norm  TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        )
      `);
      await client.execute(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      // Seed the pending roster from config exactly once, ever. Guarded by a
      // meta flag so a manager deleting everyone doesn't get it re-seeded on the
      // next cold start.
      const seeded = await client.execute(
        `SELECT 1 FROM app_meta WHERE key = 'pending_seeded'`
      );
      if (seeded.rows.length === 0) {
        const now = new Date().toISOString();
        for (const name of PENDING_EVALUATION) {
          await client.execute({
            sql: `INSERT OR IGNORE INTO pending_players (name, name_norm, created_at)
                  VALUES (?, ?, ?)`,
            args: [name, normalizeName(name), now],
          });
        }
        await client.execute(
          `INSERT INTO app_meta (key, value) VALUES ('pending_seeded', '1')`
        );
      }
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
