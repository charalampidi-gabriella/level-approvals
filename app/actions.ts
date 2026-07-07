"use server";

import { randomUUID } from "crypto";
import { db, ensureSchema, normalizeName } from "@/lib/db";
import {
  COACHES,
  OUTCOMES,
  LEVELS,
  PENDING_EVALUATION,
  feedbackRequired,
  isWrongClass,
} from "@/lib/config";
import { notifyNewEntry } from "@/lib/notify";

export type Evaluation = {
  id: string;
  date: string; // ISO
  player: string;
  outcome: string;
  coach: string;
  note: string;
  attendedLevel: string; // wrong-class only: level they showed up to
  correctLevel: string; // wrong-class only: level they should be in
  confident: boolean; // coach was 100% sure — clears the player from pending
};

type Row = Record<string, unknown>;

function toEval(r: Row): Evaluation {
  return {
    id: String(r.id),
    date: String(r.created_at),
    player: String(r.player),
    outcome: String(r.verdict), // column kept as `verdict`; holds the entry type
    coach: String(r.coach),
    note: r.note == null ? "" : String(r.note),
    attendedLevel: r.attended_level == null ? "" : String(r.attended_level),
    correctLevel: r.correct_level == null ? "" : String(r.correct_level),
    confident: Number(r.confident) === 1,
  };
}

function validate(
  player: string,
  outcome: string,
  coach: string,
  note: string,
  attendedLevel: string,
  correctLevel: string
) {
  if (!player.trim()) return "Player name is required.";
  if (!COACHES.includes(coach)) return "Pick a valid coach.";
  if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number]))
    return "Pick a valid entry type.";
  if (feedbackRequired(outcome) && !note.trim())
    return "Feedback is required for denials and wrong-class entries.";
  if (isWrongClass(outcome)) {
    if (!LEVELS.includes(attendedLevel as (typeof LEVELS)[number]))
      return "Pick the level they attended.";
    if (!LEVELS.includes(correctLevel as (typeof LEVELS)[number]))
      return "Pick the level they should be in.";
  }
  return null;
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** Log an entry. Always saves — existing history is shown in the UI, never blocks. */
export async function submitEntry(data: {
  player: string;
  outcome: string;
  coach: string;
  note?: string;
  attendedLevel?: string;
  correctLevel?: string;
  confident?: boolean;
}): Promise<SubmitResult> {
  const player = data.player.trim();
  const { outcome, coach } = data;
  const note = (data.note ?? "").trim();
  const confident = data.confident ? 1 : 0;
  // Levels only apply to wrong-class entries; ignore them otherwise.
  const attendedLevel = isWrongClass(outcome) ? (data.attendedLevel ?? "").trim() : "";
  const correctLevel = isWrongClass(outcome) ? (data.correctLevel ?? "").trim() : "";

  const err = validate(player, outcome, coach, note, attendedLevel, correctLevel);
  if (err) return { ok: false, error: err };

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await ensureSchema();
  await db().execute({
    sql: `INSERT INTO evaluations
            (id, created_at, player, player_norm, level, verdict, coach, note, status,
             attended_level, correct_level, confident)
          VALUES (?, ?, ?, ?, '', ?, ?, ?, 'active', ?, ?, ?)`,
    args: [
      id,
      createdAt,
      player,
      normalizeName(player),
      outcome,
      coach,
      note,
      attendedLevel,
      correctLevel,
      confident,
    ],
  });

  // Best-effort notification — never blocks the save.
  await notifyNewEntry({
    id,
    date: createdAt,
    player,
    outcome,
    coach,
    note,
    attendedLevel,
    correctLevel,
    confident: confident === 1,
  });

  return { ok: true };
}

// Summary of approval standing for the two gated levels.
const TRACKED = [
  { label: "4.0–4.5", approved: "Approved for 4.0–4.5", denied: "Denied for 4.0–4.5" },
  { label: "4.5", approved: "Approved for 4.5", denied: "Denied for 4.5" },
];

export type Standing = { level: string; status: string; coaches: string[] };
export type PlayerSummary = {
  player: string;
  evaluations: Evaluation[];
  standings: Standing[];
  matches: string[]; // near-match names when no exact hit
};

/** Everything on record for one player, plus approval status per gated level. */
export async function getPlayerSummary(name: string): Promise<PlayerSummary> {
  await ensureSchema();
  const norm = normalizeName(name);
  if (!norm) return { player: "", evaluations: [], standings: [], matches: [] };

  const exact = await db().execute({
    sql: `SELECT * FROM evaluations WHERE player_norm = ? ORDER BY created_at DESC`,
    args: [norm],
  });
  const rows = exact.rows.map((r) => toEval(r as Row));

  if (rows.length === 0) {
    const like = await db().execute({
      sql: `SELECT DISTINCT player FROM evaluations WHERE player_norm LIKE ? ORDER BY player`,
      args: [`%${norm}%`],
    });
    return {
      player: name,
      evaluations: [],
      standings: [],
      matches: like.rows.map((r) => String((r as Row).player)),
    };
  }

  const standings: Standing[] = [];
  for (const t of TRACKED) {
    const approvedBy = rows.filter((e) => e.outcome === t.approved);
    const deniedBy = rows.filter((e) => e.outcome === t.denied);
    if (approvedBy.length === 0 && deniedBy.length === 0) continue;
    let status: string;
    if (approvedBy.length > 0 && deniedBy.length > 0) status = "Disagreement";
    else if (approvedBy.length > 0) status = "Approved";
    else status = "Denied";
    standings.push({
      level: t.label,
      status,
      coaches: [
        ...approvedBy.map((e) => `${e.coach}: approved`),
        ...deniedBy.map((e) => `${e.coach}: denied`),
      ],
    });
  }

  return { player: rows[0].player, evaluations: rows, standings, matches: [] };
}

/** Every entry, newest first — powers the full feed under the lookup. */
export async function getAllEntries(): Promise<Evaluation[]> {
  await ensureSchema();
  const res = await db().execute(
    `SELECT * FROM evaluations ORDER BY created_at DESC`
  );
  return res.rows.map((r) => toEval(r as Row));
}

/** Distinct player names already on record — powers the type-ahead suggestions.
 *  Deduped by `player_norm` (case + whitespace-insensitive) so casing variants of
 *  the same name don't show up as separate suggestions. MIN(player) picks the
 *  most-capitalized variant since capital letters sort before lowercase. */
export async function getPlayerNames(): Promise<string[]> {
  await ensureSchema();
  const res = await db().execute(
    `SELECT MIN(player) AS player FROM evaluations GROUP BY player_norm ORDER BY player COLLATE NOCASE`
  );
  return res.rows.map((r) => String((r as Row).player));
}

/** Emailed players still awaiting a firm call — the seed list minus anyone who
 *  already has a *confident* decision on record. A tentative entry (confident=0)
 *  keeps the player pending so someone gives them a firm read later. */
export async function getPendingPlayers(): Promise<string[]> {
  await ensureSchema();
  const res = await db().execute(
    `SELECT DISTINCT player_norm FROM evaluations WHERE confident = 1`
  );
  const decided = new Set(res.rows.map((r) => String((r as Row).player_norm)));
  return PENDING_EVALUATION.filter((name) => !decided.has(normalizeName(name)));
}

export async function getConfig() {
  return { coaches: COACHES, outcomes: OUTCOMES };
}
