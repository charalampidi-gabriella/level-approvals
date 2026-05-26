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
  type PlayerSummary,
} from "./actions";

type Tab = "log" | "lookup";

export default function Page() {
  const [tab, setTab] = useState<Tab>("lookup");
  return (
    <div className="wrap">
      <header>
        <img className="logo" src="/media/rippner-logo.png" alt="Rippner Tennis" />
        <h1>Level Log</h1>
        <p>Log what you saw or decided. Everyone sees the history before they act.</p>
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
        placeholder="Start typing your name…"
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

function LogForm() {
  const [coach, setCoach] = useState("");
  const [player, setPlayer] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
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
    setNote("");
    setAttendedLevel("");
    setCorrectLevel("");
    setHistory(null);
  }

  async function onSubmit() {
    setMsg(null);
    if (!coach || !player.trim() || !outcome) {
      setMsg({ kind: "err", text: "Coach, player, and entry type are all required." });
      return;
    }
    if (feedbackRequired(outcome) && !note.trim()) {
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
      if (res.ok) {
        setSubmitted(`${player.trim()} — ${outcome}`);
        reset();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
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
      <label>Your name</label>
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

      {history && history.length > 0 && (
        <div className="history-box">
          <h3>
            {player.trim()} already has {history.length}{" "}
            {history.length === 1 ? "entry" : "entries"}
          </h3>
          <p className="hint">Review before you log — talk to the coach(es) if you disagree.</p>
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
            }}
          >
            {o}
          </button>
        ))}
      </div>

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

      <label>
        Feedback {outcome && feedbackRequired(outcome) ? "(required)" : "(optional)"}
      </label>
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
  const [data, setData] = useState<PlayerSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState<Evaluation[] | null>(null);
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    getAllEntries().then(setAll);
    getPlayerNames().then(setNames);
  }, []);

  async function search(q?: string) {
    const query = (q ?? name).trim();
    if (!query) return;
    if (q) setName(q);
    setBusy(true);
    try {
      setData(await getPlayerSummary(query));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <label>Player name</label>
      <PlayerPicker
        value={name}
        names={names}
        placeholder="Search a player"
        onChange={setName}
        onSelect={(v) => search(v)}
        onEnter={(v) => search(v)}
      />
      <button className="primary" onClick={() => search()} disabled={busy}>
        {busy ? "Searching…" : "Search"}
      </button>

      {data && data.evaluations.length === 0 && data.matches.length === 0 && (
        <div className="msg err">No entries on record for “{data.player}”.</div>
      )}

      {data && data.matches.length > 0 && (
        <div className="matches">
          <p className="hint">No exact match. Did you mean:</p>
          {data.matches.map((m) => (
            <a key={m} onClick={() => search(m)}>
              {m}
            </a>
          ))}
        </div>
      )}

      {data && data.standings.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>{data.player} — approval status</h3>
          {data.standings.map((s) => (
            <div className="standing" key={s.level}>
              <span className="lv">{s.level}</span>
              <span style={{ textAlign: "right" }}>
                <span
                  className={`pill ${
                    s.status === "Approved"
                      ? "approved"
                      : s.status === "Denied"
                      ? "notready"
                      : "discussion"
                  }`}
                >
                  {s.status}
                </span>
                <div className="who">{s.coaches.join(" · ")}</div>
              </span>
            </div>
          ))}
        </>
      )}

      {data && data.evaluations.length > 0 && (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>Full history</h3>
          {data.evaluations.map((e) => (
            <EntryLine key={e.id} e={e} />
          ))}
        </>
      )}

      {!data && all && (
        <>
          <h3 style={{ marginTop: "1.25rem" }}>
            All entries {all.length > 0 && `(${all.length})`}
          </h3>
          {all.length === 0 ? (
            <p className="hint">No entries logged yet.</p>
          ) : (
            all.map((e) => <EntryLine key={e.id} e={e} showPlayer />)
          )}
        </>
      )}
    </div>
  );
}
