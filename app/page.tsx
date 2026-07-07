"use client";

import { useEffect, useState } from "react";
import {
  COACHES,
  OUTCOMES,
  LEVELS,
  PENDING_EVALUATION,
  feedbackRequired,
  isWrongClass,
  type Outcome,
} from "@/lib/config";
import {
  submitEntry,
  getPlayerSummary,
  getAllEntries,
  getPlayerNames,
  type Evaluation,
} from "./actions";

type Tab = "log" | "lookup";

export default function Page() {
  const [tab, setTab] = useState<Tab>("log");
  // When a coach clicks a pending name in Look-up, jump to the log form with the
  // name already filled in (no retyping, no typo-split history).
  const [prefill, setPrefill] = useState("");

  function startLog(name: string) {
    setPrefill(name);
    setTab("log");
  }

  return (
    <div className="wrap">
      <header>
        <img className="logo" src="/media/rippner-logo.png" alt="Rippner Tennis" />
        <h1>Level Log</h1>
        <p>Log coaches' level decisions so the team shares one history.</p>
      </header>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "lookup"}
          onClick={() => setTab("lookup")}
        >
          Look up player
        </button>
        <button
          role="tab"
          aria-selected={tab === "log"}
          onClick={() => {
            setPrefill("");
            setTab("log");
          }}
        >
          Log entry
        </button>
      </div>
      {tab === "log" ? (
        <LogForm initialPlayer={prefill} />
      ) : (
        <Lookup onEvaluate={startLog} />
      )}
    </div>
  );
}

// Client-safe name normalizer (mirrors normalizeName in lib/db.ts, which is
// server-only). Used to group the feed by player.
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Gated levels — a player is "in disagreement" when two different coaches land
// on opposite sides (approved vs denied) of the same gated level.
const GATED = [
  { approved: "Approved for 4.0–4.5", denied: "Denied for 4.0–4.5" },
  { approved: "Approved for 4.5", denied: "Denied for 4.5" },
];

function hasDisagreement(entries: Evaluation[]): boolean {
  return GATED.some((g) => {
    const approvers = new Set(
      entries.filter((e) => e.outcome === g.approved).map((e) => e.coach)
    );
    const deniers = new Set(
      entries.filter((e) => e.outcome === g.denied).map((e) => e.coach)
    );
    if (approvers.size === 0 || deniers.size === 0) return false;
    // Needs at least two distinct coaches across the two sides — one coach
    // changing their own mind isn't a disagreement.
    return new Set([...approvers, ...deniers]).size >= 2;
  });
}

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function outcomeClass(o: string) {
  if (o.startsWith("Approved")) return "approved";
  if (o.startsWith("Denied")) return "notready";
  return "misplaced"; // Showed up at wrong class
}

// A single logged decision, which may carry more than one outcome when a coach
// logged a paired call in one go (e.g. "Denied for 4.5" + "Approved for 4.0–4.5").
type EntryGroup = {
  id: string;
  player: string;
  coach: string;
  date: string;
  note: string;
  attendedLevel: string;
  correctLevel: string;
  outcomes: string[];
};

// Collapse the two rows of a paired decision into one entry. Entries are grouped
// when the same coach logged the same player with the same note within a short
// window — this also merges historical pairs logged before they shared a row.
function groupEntries(list: Evaluation[]): EntryGroup[] {
  const WINDOW = 5 * 60 * 1000; // 5 minutes
  const groups: EntryGroup[] = [];
  const byKey = new Map<string, EntryGroup[]>();
  for (const e of list) {
    const key = `${e.coach}|${norm(e.player)}|${e.note}`;
    const t = new Date(e.date).getTime();
    const match = (byKey.get(key) ?? []).find(
      (g) => Math.abs(new Date(g.date).getTime() - t) <= WINDOW
    );
    if (match) {
      if (!match.outcomes.includes(e.outcome)) match.outcomes.push(e.outcome);
      if (e.attendedLevel) match.attendedLevel = e.attendedLevel;
      if (e.correctLevel) match.correctLevel = e.correctLevel;
      if (t > new Date(match.date).getTime()) match.date = e.date; // show latest
    } else {
      const g: EntryGroup = {
        id: e.id,
        player: e.player,
        coach: e.coach,
        date: e.date,
        note: e.note,
        attendedLevel: e.attendedLevel,
        correctLevel: e.correctLevel,
        outcomes: [e.outcome],
      };
      groups.push(g);
      byKey.set(key, [...(byKey.get(key) ?? []), g]);
    }
  }
  // Stable pill order per group (by the canonical OUTCOMES order).
  for (const g of groups) {
    g.outcomes.sort((a, b) => OUTCOMES.indexOf(a as never) - OUTCOMES.indexOf(b as never));
  }
  return groups;
}

function EntryLine({ g, showPlayer }: { g: EntryGroup; showPlayer?: boolean }) {
  return (
    <div className="entry">
      <div className="top">
        <span>
          {showPlayer && <span className="player-name">{g.player} — </span>}
          <span className="coach">{g.coach}</span>{" "}
          {g.outcomes.map((o) => (
            <span key={o} className={`pill ${outcomeClass(o)}`}>
              {o}
            </span>
          ))}
        </span>
        <span className="date">{fmt(g.date)}</span>
      </div>
      {g.attendedLevel && g.correctLevel && (
        <div className="levels-line">
          Attended <strong>{g.attendedLevel}</strong> · should be{" "}
          <strong>{g.correctLevel}</strong>
        </div>
      )}
      {g.note && <div className="note">{g.note}</div>}
    </div>
  );
}

function CoachPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = q ? COACHES.filter((c) => c.toLowerCase().includes(q)) : COACHES;
  const valid = COACHES.includes(query);

  function pick(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  return (
    <div className="combo">
      <input
        type="text"
        value={query}
        placeholder="Start typing the coach's name…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(COACHES.includes(e.target.value) ? e.target.value : "");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="combo-list">
          {matches.map((c) => (
            <div key={c} className="combo-item" onMouseDown={() => pick(c)}>
              {c}
            </div>
          ))}
        </div>
      )}
      {query && !valid && !open && <p className="hint">Pick a name from the list.</p>}
    </div>
  );
}

// Free-text name input with type-ahead suggestions from existing players.
// Unlike CoachPicker, any value is allowed (new players won't be on record yet).
function PlayerPicker({
  value,
  names,
  placeholder,
  onChange,
  onSelect,
  onEnter,
  onBlur,
}: {
  value: string;
  names: string[];
  placeholder?: string;
  onChange: (v: string) => void;
  onSelect?: (v: string) => void;
  onEnter?: (v: string) => void;
  onBlur?: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q
    ? names.filter((n) => n.toLowerCase().includes(q)).slice(0, 8)
    : [];

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    onSelect?.(name);
  }

  return (
    <div className="combo">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            onBlur?.(value);
          }, 150)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpen(false);
            onEnter?.(value);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="combo-list">
          {matches.map((n) => (
            <div key={n} className="combo-item" onMouseDown={() => pick(n)}>
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type NextLevelOutcome = "" | "Approved for 4.5" | "Denied for 4.5";
type LowerLevelOutcome = "" | "Approved for 4.0–4.5" | "Denied for 4.0–4.5";

function LogForm({ initialPlayer = "" }: { initialPlayer?: string }) {
  const [coach, setCoach] = useState("");
  const [player, setPlayer] = useState(initialPlayer);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [nextLevelOutcome, setNextLevelOutcome] = useState<NextLevelOutcome>("");
  const [lowerLevelOutcome, setLowerLevelOutcome] = useState<LowerLevelOutcome>("");
  const [note, setNote] = useState("");
  const [attendedLevel, setAttendedLevel] = useState("");
  const [correctLevel, setCorrectLevel] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory] = useState<Evaluation[] | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    getPlayerNames().then(setNames);
    // Pre-filled from a pending-player click — surface their history immediately.
    if (initialPlayer) loadHistory(initialPlayer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHistory(raw: string) {
    const name = raw.trim();
    if (!name) {
      setHistory(null);
      return;
    }
    const summary = await getPlayerSummary(name);
    setHistory(summary.evaluations);
  }

  function reset() {
    setPlayer("");
    setOutcome("");
    setNextLevelOutcome("");
    setLowerLevelOutcome("");
    setNote("");
    setAttendedLevel("");
    setCorrectLevel("");
    setHistory(null);
  }

  // The optional companion entry logged alongside the primary outcome:
  // a 4.5 read when approving for 4.0–4.5, or a 4.0–4.5 read when denying 4.5.
  const companionOutcome: string = nextLevelOutcome || lowerLevelOutcome;

  const feedbackIsRequired =
    (!!outcome && feedbackRequired(outcome)) ||
    (!!companionOutcome && feedbackRequired(companionOutcome));

  async function onSubmit() {
    setMsg(null);
    if (!coach || !player.trim() || !outcome) {
      setMsg({ kind: "err", text: "Coach, player, and entry type are all required." });
      return;
    }
    if (outcome === "Approved for 4.0–4.5" && !nextLevelOutcome) {
      setMsg({
        kind: "err",
        text: "Also pick a 4.5 evaluation — approved or not ready.",
      });
      return;
    }
    if (feedbackIsRequired && !note.trim()) {
      setMsg({ kind: "err", text: "Feedback is required for denials and wrong-class entries." });
      return;
    }
    if (isWrongClass(outcome) && (!attendedLevel || !correctLevel)) {
      setMsg({ kind: "err", text: "Pick the level they attended and the level they should be in." });
      return;
    }
    setBusy(true);
    try {
      const res = await submitEntry({ player, outcome, coach, note, attendedLevel, correctLevel });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      if (companionOutcome) {
        const res2 = await submitEntry({
          player,
          outcome: companionOutcome,
          coach,
          note,
        });
        if (!res2.ok) {
          setMsg({
            kind: "err",
            text: `Saved ${outcome}, but companion entry failed: ${res2.error}`,
          });
          return;
        }
        setSubmitted(`${player.trim()} — ${outcome} + ${companionOutcome}`);
      } else {
        setSubmitted(`${player.trim()} — ${outcome}`);
      }
      reset();
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="card submitted-card">
        <div className="submitted-check">✓</div>
        <h2>Submitted</h2>
        <p className="submitted-detail">{submitted}</p>
        <button
          className="primary"
          onClick={() => {
            setSubmitted(null);
            setMsg(null);
          }}
        >
          Log another entry
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <label>Coach who made the call</label>
      <CoachPicker value={coach} onChange={setCoach} />

      <label>Player</label>
      <PlayerPicker
        value={player}
        names={names}
        placeholder="Full name (exactly as it appears on roster)"
        onChange={(v) => {
          setPlayer(v);
          setHistory(null);
        }}
        onSelect={loadHistory}
        onBlur={loadHistory}
      />
      <p className="hint">
        <strong>Match the roster spelling.</strong> Capitalization doesn't matter, but a typo
        (e.g. "Jon" vs "John") creates a separate record and hides history from other coaches.
      </p>

      {history && history.length > 0 && (() => {
        const groups = groupEntries(history);
        return (
          <div className="history-box">
            <h3>
              {player.trim()} already has {groups.length}{" "}
              {groups.length === 1 ? "entry" : "entries"}
            </h3>
            <p className="hint">
              Review before logging, but go ahead and submit your own read even if it conflicts
              with what's already on record — the disagreement is the useful part.
            </p>
            {groups.map((g) => (
              <EntryLine key={g.id} g={g} />
            ))}
          </div>
        );
      })()}

      <label>What are you logging?</label>
      <div className="outcome-list">
        {OUTCOMES.map((o) => (
          <button
            type="button"
            key={o}
            className={`outcome-btn ${outcome === o ? `sel-${outcomeClass(o)}` : ""}`}
            onClick={() => {
              setOutcome(o);
              if (!isWrongClass(o)) {
                setAttendedLevel("");
                setCorrectLevel("");
              }
              if (o !== "Approved for 4.0–4.5") {
                setNextLevelOutcome("");
              }
              if (o !== "Denied for 4.5") {
                setLowerLevelOutcome("");
              }
            }}
          >
            {o}
          </button>
        ))}
      </div>

      {outcome === "Approved for 4.0–4.5" && (
        <div className="next-level">
          <label>Evaluation for 4.5 (required)</label>
          <div className="outcome-list">
            <button
              type="button"
              className={`outcome-btn ${
                nextLevelOutcome === "Approved for 4.5" ? "sel-approved" : ""
              }`}
              onClick={() =>
                setNextLevelOutcome(
                  nextLevelOutcome === "Approved for 4.5" ? "" : "Approved for 4.5"
                )
              }
            >
              Approved for 4.5
            </button>
            <button
              type="button"
              className={`outcome-btn ${
                nextLevelOutcome === "Denied for 4.5" ? "sel-notready" : ""
              }`}
              onClick={() =>
                setNextLevelOutcome(
                  nextLevelOutcome === "Denied for 4.5" ? "" : "Denied for 4.5"
                )
              }
            >
              Not ready for 4.5
            </button>
          </div>
          <p className="hint">Required — when approving for 4.0–4.5, also log what you think about 4.5.</p>
        </div>
      )}

      {outcome === "Denied for 4.5" && (
        <div className="next-level">
          <label>Evaluation for 4.0–4.5 (optional)</label>
          <div className="outcome-list">
            <button
              type="button"
              className={`outcome-btn ${
                lowerLevelOutcome === "Approved for 4.0–4.5" ? "sel-approved" : ""
              }`}
              onClick={() =>
                setLowerLevelOutcome(
                  lowerLevelOutcome === "Approved for 4.0–4.5" ? "" : "Approved for 4.0–4.5"
                )
              }
            >
              Approved for 4.0–4.5
            </button>
            <button
              type="button"
              className={`outcome-btn ${
                lowerLevelOutcome === "Denied for 4.0–4.5" ? "sel-notready" : ""
              }`}
              onClick={() =>
                setLowerLevelOutcome(
                  lowerLevelOutcome === "Denied for 4.0–4.5" ? "" : "Denied for 4.0–4.5"
                )
              }
            >
              Not ready for 4.0–4.5
            </button>
          </div>
          <p className="hint">Optional — if they're not ready for 4.5, log whether they're cleared for 4.0–4.5.</p>
        </div>
      )}

      {isWrongClass(outcome) && (
        <div className="levels">
          <div>
            <label>Level they attended</label>
            <select
              value={attendedLevel}
              onChange={(e) => setAttendedLevel(e.target.value)}
            >
              <option value="">Select level…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Level they should be in</label>
            <select
              value={correctLevel}
              onChange={(e) => setCorrectLevel(e.target.value)}
            >
              <option value="">Select level…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <label>Feedback {feedbackIsRequired ? "(required)" : "(optional)"}</label>
      <textarea
        value={note}
        placeholder="Why — strokes, movement, match play, which class they showed up to…"
        onChange={(e) => setNote(e.target.value)}
      />

      <button className="primary" onClick={onSubmit} disabled={busy}>
        {busy ? "Saving…" : "Save entry"}
      </button>

      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

function Lookup({ onEvaluate }: { onEvaluate: (name: string) => void }) {
  const [name, setName] = useState("");
  const [all, setAll] = useState<Evaluation[] | null>(null);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    getAllEntries().then(setAll);
    getPlayerNames().then(setNames);
  }, []);

  // Group the loaded feed by normalized player name so we can derive who is
  // still pending and who is in disagreement — all client-side, no extra calls.
  const byPlayer = new Map<string, Evaluation[]>();
  for (const e of all ?? []) {
    const k = norm(e.player);
    const list = byPlayer.get(k);
    if (list) list.push(e);
    else byPlayer.set(k, [e]);
  }

  // Pending = emailed players not yet evaluated by two different coaches.
  // `votes` is the distinct-coach count so far (0 or 1 while still pending).
  const pending = PENDING_EVALUATION.map((p) => {
    const entries = byPlayer.get(norm(p)) ?? [];
    return { name: p, votes: new Set(entries.map((e) => e.coach)).size };
  }).filter((p) => p.votes < 2);

  // Disagreements = any player (not just the emailed ones) with conflicting calls.
  const disagreements: string[] = [];
  for (const entries of byPlayer.values()) {
    if (hasDisagreement(entries)) disagreements.push(entries[0].player);
  }

  // Filter the already-loaded feed in place — no server round-trip.
  const q = name.trim().toLowerCase();
  const filtered = all
    ? q
      ? all.filter((e) => e.player.toLowerCase().includes(q))
      : all
    : null;

  // Collapse paired decisions into single rows for the feed.
  const filteredGroups = filtered ? groupEntries(filtered) : null;

  // Flag the results when the searched player(s) have a coach disagreement.
  const filteredDisagrees =
    q && filtered
      ? [...new Set(filtered.map((e) => norm(e.player)))].some((k) =>
          hasDisagreement(byPlayer.get(k) ?? [])
        )
      : false;

  return (
    <div className="card">
      {pending.length > 0 && (
        <div className="pending-box">
          <h3>Pending evaluation ({pending.length})</h3>
          <p className="hint">
            These players asked to be evaluated. Click a name to log your call —
            it drops off once two different coaches have weighed in.
          </p>
          <div className="pending-chips">
            {pending.map((p) => (
              <button
                key={p.name}
                type="button"
                className="chip"
                onClick={() => onEvaluate(p.name)}
              >
                {p.name}
                {p.votes > 0 && <span className="chip-votes"> {p.votes}/2</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {disagreements.length > 0 && (
        <div className="disagree-box">
          <h3>⚠ Coaches disagree ({disagreements.length})</h3>
          <p className="hint">
            Two coaches landed on opposite sides for a gated level. Click a name
            to see the entries and reconcile.
          </p>
          <div className="pending-chips">
            {disagreements.map((p) => (
              <button
                key={p}
                type="button"
                className="chip warn"
                onClick={() => setName(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <label>Player name</label>
      <PlayerPicker
        value={name}
        names={names}
        placeholder="Filter by player"
        onChange={setName}
      />

      {filteredGroups && (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>
            {q ? `Results for “${name.trim()}”` : "All entries"}{" "}
            {filteredGroups.length > 0 && `(${filteredGroups.length})`}
          </h3>
          {filteredDisagrees && (
            <div className="disagree-banner">
              ⚠ Coaches disagree on a gated level for this player — reconcile before acting.
            </div>
          )}
          {filteredGroups.length === 0 ? (
            <p className="hint">
              {q ? "No entries match that name." : "No entries logged yet."}
            </p>
          ) : (
            filteredGroups.map((g) => <EntryLine key={g.id} g={g} showPlayer />)
          )}
        </>
      )}
    </div>
  );
}
