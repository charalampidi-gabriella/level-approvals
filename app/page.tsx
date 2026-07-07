"use client";

import { useEffect, useState } from "react";
import {
  COACHES,
  OUTCOMES,
  LEVELS,
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
  return (
    <div className="wrap">
      <header>
        <img className="logo" src="/media/rippner-logo.png" alt="Rippner Tennis" />
        <h1>Level Log</h1>
        <p>Log coaches' level decisions so the team shares one history.</p>
      </header>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "lookup"} onClick={() => setTab("lookup")}>
          Look up player
        </button>
        <button role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>
          Log entry
        </button>
      </div>
      {tab === "log" ? <LogForm /> : <Lookup />}
    </div>
  );
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

function EntryLine({ e, showPlayer }: { e: Evaluation; showPlayer?: boolean }) {
  return (
    <div className="entry">
      <div className="top">
        <span>
          {showPlayer && <span className="player-name">{e.player} — </span>}
          <span className="coach">{e.coach}</span>{" "}
          <span className={`pill ${outcomeClass(e.outcome)}`}>{e.outcome}</span>
        </span>
        <span className="date">{fmt(e.date)}</span>
      </div>
      {e.attendedLevel && e.correctLevel && (
        <div className="levels-line">
          Attended <strong>{e.attendedLevel}</strong> · should be{" "}
          <strong>{e.correctLevel}</strong>
        </div>
      )}
      {e.note && <div className="note">{e.note}</div>}
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

function LogForm() {
  const [coach, setCoach] = useState("");
  const [player, setPlayer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [nextLevelOutcome, setNextLevelOutcome] = useState<NextLevelOutcome>("");
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
    setNote("");
    setAttendedLevel("");
    setCorrectLevel("");
    setHistory(null);
  }

  const feedbackIsRequired =
    (!!outcome && feedbackRequired(outcome)) ||
    (!!nextLevelOutcome && feedbackRequired(nextLevelOutcome));

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
      if (nextLevelOutcome) {
        const res2 = await submitEntry({
          player,
          outcome: nextLevelOutcome,
          coach,
          note,
        });
        if (!res2.ok) {
          setMsg({
            kind: "err",
            text: `Saved ${outcome}, but 4.5 entry failed: ${res2.error}`,
          });
          return;
        }
        setSubmitted(`${player.trim()} — ${outcome} + ${nextLevelOutcome}`);
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

      {history && history.length > 0 && (
        <div className="history-box">
          <h3>
            {player.trim()} already has {history.length}{" "}
            {history.length === 1 ? "entry" : "entries"}
          </h3>
          <p className="hint">
            Review before logging, but go ahead and submit your own read even if it conflicts
            with what's already on record — the disagreement is the useful part.
          </p>
          {history.map((e) => (
            <EntryLine key={e.id} e={e} />
          ))}
        </div>
      )}

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

function Lookup() {
  const [name, setName] = useState("");
  const [all, setAll] = useState<Evaluation[] | null>(null);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    getAllEntries().then(setAll);
    getPlayerNames().then(setNames);
  }, []);

  // Filter the already-loaded feed in place — no server round-trip.
  const q = name.trim().toLowerCase();
  const filtered = all
    ? q
      ? all.filter((e) => e.player.toLowerCase().includes(q))
      : all
    : null;

  return (
    <div className="card">
      <label>Player name</label>
      <PlayerPicker
        value={name}
        names={names}
        placeholder="Filter by player"
        onChange={setName}
      />

      {filtered && (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>
            {q ? `Results for “${name.trim()}”` : "All entries"}{" "}
            {filtered.length > 0 && `(${filtered.length})`}
          </h3>
          {filtered.length === 0 ? (
            <p className="hint">
              {q ? "No entries match that name." : "No entries logged yet."}
            </p>
          ) : (
            filtered.map((e) => <EntryLine key={e.id} e={e} showPlayer />)
          )}
        </>
      )}
    </div>
  );
}
