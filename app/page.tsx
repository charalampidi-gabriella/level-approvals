"use client";

import { useEffect, useState } from "react";
import {
  COACHES,
  OUTCOMES,
  LEVELS,
  LEVEL_475,
  feedbackRequired,
  isWrongClass,
  type Outcome,
} from "@/lib/config";
import {
  submitEntry,
  getPlayerSummary,
  getAllEntries,
  getPlayerNames,
  getPendingSeed,
  adminListPending,
  addPendingPlayer,
  removePendingPlayer,
  getFollowups,
  setFollowup,
  clearFollowup,
  getResolutions,
  resolveDisagreement,
  type Evaluation,
  type PendingPlayer,
  type PendingCategory,
  type Followup,
  type FollowupStage,
  type Resolution,
} from "./actions";

type Tab = "log" | "lookup" | "admin";

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
          onClick={() => setTab("log")}
        >
          Log entry
        </button>
        <button
          role="tab"
          aria-selected={tab === "admin"}
          onClick={() => setTab("admin")}
        >
          Manage list
        </button>
      </div>
      {tab === "log" ? <LogForm /> : tab === "lookup" ? <Lookup /> : <Admin />}
    </div>
  );
}

// Client-safe name normalizer (mirrors normalizeName in lib/db.ts, which is
// server-only). Used to group the feed by player.
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Players carrying the elite "4.75" designation (see LEVEL_475 in config).
const SET_475 = new Set(LEVEL_475.map(norm));
const is475 = (name: string) => SET_475.has(norm(name));
const Badge475 = () => <span className="badge-475">4.5–5.0</span>;
const BadgeUstaC = () => <span className="badge-usta">USTA 4.5C</span>;

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

function EntryLine({
  g,
  showPlayer,
  secondEvalPending,
  ustaC,
}: {
  g: EntryGroup;
  showPlayer?: boolean;
  secondEvalPending?: boolean;
  ustaC?: boolean;
}) {
  return (
    <div className="entry">
      <div className="top">
        <span>
          {showPlayer && (
            <>
              <span className="player-name">{g.player}</span>
              {is475(g.player) && <Badge475 />}
              {ustaC && <BadgeUstaC />}
              <span className="player-name"> — </span>
            </>
          )}
          <span className="coach">{g.coach}</span>{" "}
          {g.outcomes.map((o) => (
            <span key={o} className={`pill ${outcomeClass(o)}`}>
              {o}
            </span>
          ))}
          {secondEvalPending && (
            <span className="badge-2nd">2nd evaluation pending</span>
          )}
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

function LogForm() {
  const [coach, setCoach] = useState("");
  const [player, setPlayer] = useState("");
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
  const [all, setAll] = useState<Evaluation[] | null>(null);
  const [pendingSeed, setPendingSeed] = useState<PendingPlayer[]>([]);

  useEffect(() => {
    getPlayerNames().then(setNames);
    getAllEntries().then(setAll);
    getPendingSeed().then(setPendingSeed);
  }, []);

  // Pending players (from the manager-editable list) not yet cleared. How many
  // distinct coaches must weigh in depends on the category: 'refresh' players
  // (already approved once, list being re-vetted) need 2, 'new' players need 1.
  const byPlayer = new Map<string, Evaluation[]>();
  for (const e of all ?? []) {
    const k = norm(e.player);
    const list = byPlayer.get(k);
    if (list) list.push(e);
    else byPlayer.set(k, [e]);
  }
  const pendingAll = pendingSeed
    .filter((p) => p.category !== "computer") // computer-rated players are pre-approved, never pending
    .map((p) => {
      const entries = byPlayer.get(norm(p.name)) ?? [];
      return {
        ...p,
        votes: new Set(entries.map((e) => e.coach)).size,
        needed: p.category === "new" ? 1 : 2,
      };
    })
    .filter((p) => p.votes < p.needed);
  const pendingRefresh = pendingAll.filter((p) => p.category === "refresh");
  const pendingNew = pendingAll.filter((p) => p.category === "new");

  // USTA computer-rated 4.5 players — for the "USTA 4.5C" badge in history.
  const ustaSet = new Set(
    pendingSeed.filter((p) => p.category === "computer").map((p) => norm(p.name))
  );

  function pickPending(name: string) {
    setPlayer(name);
    loadHistory(name);
  }

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
    if (outcome === "Denied for 4.5" && !lowerLevelOutcome) {
      setMsg({
        kind: "err",
        text: "Also pick a 4.0–4.5 evaluation — approved or not ready.",
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
      getAllEntries().then(setAll); // refresh pending vote counts
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
      {pendingRefresh.length > 0 && (
        <div className="pending-box">
          <h3>Pending re-approval ({pendingRefresh.length})</h3>
          <p className="hint">
            Previously approved — we&apos;re refreshing the list. Click a name to fill it
            in below; it drops off once <strong>two different coaches</strong> have weighed in.
          </p>
          <div className="pending-chips">
            {pendingRefresh.map((p) => (
              <button
                key={p.name}
                type="button"
                className="chip"
                onClick={() => pickPending(p.name)}
              >
                {p.name}
                {p.votes > 0 && <span className="chip-votes"> {p.votes}/2</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingNew.length > 0 && (
        <div className="pending-box pending-box-new">
          <h3>Pending first evaluation ({pendingNew.length})</h3>
          <p className="hint">
            New requests — click a name to fill it in below; <strong>one coach&apos;s</strong>{" "}
            evaluation clears it. We&apos;re raising the bar, so if you&apos;re unsure,
            it&apos;s fine to approve them only for 4.0–4.5.
          </p>
          <div className="pending-chips">
            {pendingNew.map((p) => (
              <button
                key={p.name}
                type="button"
                className="chip"
                onClick={() => pickPending(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

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
              {player.trim()} {is475(player) && <Badge475 />}
              {ustaSet.has(norm(player)) && <BadgeUstaC />} already has {groups.length}{" "}
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
          <label>Evaluation for 4.0–4.5 (required)</label>
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
          <p className="hint">Required — when denying 4.5, also log whether they're cleared for 4.0–4.5.</p>
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
  const [pendingSeed, setPendingSeed] = useState<PendingPlayer[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [dragOverBox, setDragOverBox] = useState<FollowupStage | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    getAllEntries().then(setAll);
    getPlayerNames().then(setNames);
    getPendingSeed().then(setPendingSeed);
    getFollowups().then(setFollowups);
    getResolutions().then(setResolutions);
  }, []);

  const followupSet = new Set(followups.map((f) => norm(f.name)));
  const resolvedSet = new Set(resolutions.map((r) => norm(r.name)));

  function resolve(name: string, verdict: string) {
    resolveDisagreement(name, verdict).then(setResolutions);
    setResolving(null);
  }
  const emailedList = followups.filter((f) => f.stage === "emailed").map((f) => f.name);
  const doneList = followups.filter((f) => f.stage === "done").map((f) => f.name);

  // Drop onto the "emailed to create account" box — no confirm (reversible).
  function onDropEmailed(e: React.DragEvent) {
    e.preventDefault();
    setDragOverBox(null);
    const dropped = e.dataTransfer.getData("text/plain");
    if (dropped) setFollowup(dropped, "emailed").then(setFollowups);
  }

  // Drop onto the "done" box — confirm since it's the final state.
  function onDropDone(e: React.DragEvent) {
    e.preventDefault();
    setDragOverBox(null);
    const dropped = e.dataTransfer.getData("text/plain");
    if (!dropped) return;
    if (
      window.confirm(
        `Are you sure this is done for ${dropped}?\n\n(account created, rating adjusted, email replied)`
      )
    ) {
      setFollowup(dropped, "done").then(setFollowups);
    }
  }

  function moveToDone(p: string) {
    if (
      window.confirm(
        `Are you sure this is done for ${p}?\n\n(account created, rating adjusted, email replied)`
      )
    ) {
      setFollowup(p, "done").then(setFollowups);
    }
  }

  // Group the loaded feed by normalized player name so we can derive who is
  // in disagreement — all client-side, no extra calls.
  const byPlayer = new Map<string, Evaluation[]>();
  for (const e of all ?? []) {
    const k = norm(e.player);
    const list = byPlayer.get(k);
    if (list) list.push(e);
    else byPlayer.set(k, [e]);
  }

  // Disagreements = any player with conflicting calls, minus those a manager has
  // already resolved with a final verdict.
  const disagreements: string[] = [];
  for (const entries of byPlayer.values()) {
    if (hasDisagreement(entries) && !resolvedSet.has(norm(entries[0].player))) {
      disagreements.push(entries[0].player);
    }
  }

  // Re-approval players (need 2 coaches) who have exactly one evaluation so far —
  // still waiting on a second. Keyed by normalized name.
  const awaiting2nd = new Set<string>();
  for (const p of pendingSeed) {
    if (p.category !== "refresh") continue;
    const votes = new Set((byPlayer.get(norm(p.name)) ?? []).map((e) => e.coach)).size;
    if (votes === 1) awaiting2nd.add(norm(p.name));
  }

  // USTA computer-rated 4.5 players — carry the "USTA 4.5C" badge.
  const ustaSet = new Set(
    pendingSeed.filter((p) => p.category === "computer").map((p) => norm(p.name))
  );

  // "Evaluation completed" = pending players with a *final* evaluation: the
  // required number of distinct coaches have made a call — approved OR denied —
  // and there's no open disagreement. A settled denial counts as final too.
  const goodToGo: string[] = [];
  for (const p of pendingSeed) {
    if (p.category === "computer") continue; // auto-approved, tracked separately
    const needed = p.category === "new" ? 1 : 2;
    const entries = byPlayer.get(norm(p.name)) ?? [];
    const decided = new Set(
      entries
        .filter((e) => e.outcome.startsWith("Approved") || e.outcome.startsWith("Denied"))
        .map((e) => e.coach)
    ).size;
    if (decided >= needed && !hasDisagreement(entries)) goodToGo.push(p.name);
  }
  // Resolved disagreements are complete too — add any not already listed.
  const inGoodToGo = new Set(goodToGo.map(norm));
  for (const r of resolutions) {
    if (!inGoodToGo.has(norm(r.name))) {
      goodToGo.push(r.name);
      inGoodToGo.add(norm(r.name));
    }
  }
  goodToGo.sort((a, b) => a.localeCompare(b));

  // Final-verdict lookup for the "Evaluation completed" chips (resolved players).
  const resolvedVerdict = new Map(resolutions.map((r) => [norm(r.name), r.verdict]));

  // Players still awaiting follow-up (not yet moved into an emailed/done box).
  const goodToGoOpen = goodToGo.filter((n) => !followupSet.has(norm(n)));
  const hasFollowupContext =
    goodToGoOpen.length > 0 || emailedList.length > 0 || doneList.length > 0;

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
      {goodToGoOpen.length > 0 && (
        <div className="goodtogo-box">
          <h3>✅ Evaluation completed ({goodToGoOpen.length})</h3>
          <p className="hint">
            Final evaluation reached — the required coaches have made their call
            (approved or denied), with no open disagreement. Click a name to see
            it, or <strong>drag it to a box below</strong> as follow-up progresses.
          </p>
          <div className="pending-chips">
            {goodToGoOpen.map((p) => {
              const v = resolvedVerdict.get(norm(p));
              return (
                <button
                  key={p}
                  type="button"
                  className="chip good draggable"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p)}
                  onClick={() => setName(p)}
                >
                  {p}
                  {v && (
                    <span className={`verdict-mini ${outcomeClass(v)}`}>
                      {v.replace("Approved for ", "✓ ").replace("Denied for ", "✗ ")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasFollowupContext && (
        <div
          className={`emailed-box ${dragOverBox === "emailed" ? "dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverBox("emailed");
          }}
          onDragLeave={() => setDragOverBox(null)}
          onDrop={onDropEmailed}
        >
          <h3>📧 Emailed to create account ({emailedList.length})</h3>
          <p className="hint">
            Evaluation done, account not created yet — emailed asking them to create
            one. Drag names here; drag to the box below (or hit ✓) once fully done.
          </p>
          {emailedList.length > 0 && (
            <div className="pending-chips">
              {emailedList.map((p) => (
                <span
                  key={p}
                  className="chip emailed-chip"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p)}
                >
                  <button type="button" className="done-name" onClick={() => setName(p)}>
                    {p}
                  </button>
                  <button
                    type="button"
                    className="chip-fwd"
                    title={`Mark ${p} fully done`}
                    aria-label={`Mark ${p} fully done`}
                    onClick={() => moveToDone(p)}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className="chip-undo"
                    title={`Move ${p} back to Evaluation completed`}
                    aria-label={`Move ${p} back to Evaluation completed`}
                    onClick={() => clearFollowup(p).then(setFollowups)}
                  >
                    ↩
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {hasFollowupContext && (
        <div
          className={`done-box ${dragOverBox === "done" ? "dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverBox("done");
          }}
          onDragLeave={() => setDragOverBox(null)}
          onDrop={onDropDone}
        >
          <h3>🏁 Account created · rating adjusted · email replied ({doneList.length})</h3>
          <p className="hint">
            Fully done. Drag a name here from either box above.
          </p>
          {doneList.length > 0 && (
            <div className="pending-chips">
              {doneList.map((p) => (
                <span
                  key={p}
                  className="chip done-chip"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", p)}
                >
                  <button type="button" className="done-name" onClick={() => setName(p)}>
                    {p}
                  </button>
                  <button
                    type="button"
                    className="chip-undo"
                    title={`Move ${p} back`}
                    aria-label={`Move ${p} back`}
                    onClick={() => clearFollowup(p).then(setFollowups)}
                  >
                    ↩
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {disagreements.length > 0 && (
        <div className="disagree-box">
          <h3>⚠ Coaches disagree ({disagreements.length})</h3>
          <p className="hint">
            Two coaches landed on opposite sides for a gated level.{" "}
            <strong>Click a name to set the final verdict</strong> and move it to
            Evaluation completed.
          </p>
          <div className="pending-chips">
            {disagreements.map((p) => (
              <button
                key={p}
                type="button"
                className="chip warn"
                onClick={() => setResolving(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolving && (
        <div className="modal-overlay" onClick={() => setResolving(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Final verdict — {resolving}</h3>
            <p className="hint">
              Coaches disagreed. Set the final call to resolve it and move the
              player to Evaluation completed.
            </p>
            <div className="modal-conflict">
              {[
                ...new Set(
                  (byPlayer.get(norm(resolving)) ?? [])
                    .filter(
                      (e) =>
                        e.outcome.startsWith("Approved") || e.outcome.startsWith("Denied")
                    )
                    .map((e) => `${e.coach} — ${e.outcome}`)
                ),
              ].map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <div className="modal-verdicts">
              {OUTCOMES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`outcome-btn sel-${outcomeClass(v)}`}
                  onClick={() => resolve(resolving, v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="modal-cancel" onClick={() => setResolving(null)}>
              Cancel
            </button>
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
            {q && is475(name) && <Badge475 />}
            {q && ustaSet.has(norm(name)) && <BadgeUstaC />}{" "}
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
            filteredGroups.map((g) => (
              <EntryLine
                key={g.id}
                g={g}
                showPlayer
                secondEvalPending={awaiting2nd.has(norm(g.player))}
                ustaC={ustaSet.has(norm(g.player))}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

// Manager-only screen (passcode-gated) for editing the pending-evaluation list.
function Admin() {
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [list, setList] = useState<PendingPlayer[]>([]);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<PendingCategory>("new");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function unlock() {
    setErr(null);
    setBusy(true);
    try {
      const res = await adminListPending(passcode);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setList(res.pending);
      setUnlocked(true);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await addPendingPlayer(newName, passcode, newCategory);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setList(res.pending);
      setNewName("");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    setErr(null);
    setBusy(true);
    try {
      const res = await removePendingPlayer(name, passcode);
      if (res.ok) setList(res.pending);
      else setErr(res.error);
    } finally {
      setBusy(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="card">
        <label>Manager passcode</label>
        <input
          type="password"
          value={passcode}
          placeholder="Enter passcode to manage the pending list"
          autoComplete="off"
          onChange={(e) => setPasscode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") unlock();
          }}
        />
        <button className="primary" onClick={unlock} disabled={busy || !passcode}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        {err && <div className="msg err">{err}</div>}
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 0.25rem" }}>Pending evaluation list ({list.length})</h3>
      <p className="hint">
        Add players who asked to be evaluated. They appear as clickable chips on
        the Log tab. <strong>Re-approval</strong> players (already approved once)
        clear after two coaches weigh in; <strong>first evaluation</strong> players
        clear after one. <strong>4.5 computer rating</strong> players are approved
        for 4.5 automatically (screenshot provided) and get a USTA&nbsp;4.5C badge.
      </p>

      <label>Add a player</label>
      <div className="admin-add">
        <input
          type="text"
          value={newName}
          placeholder="Full name"
          autoComplete="off"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button className="admin-add-btn" onClick={add} disabled={busy || !newName.trim()}>
          Add
        </button>
      </div>
      <div className="outcome-list" style={{ marginTop: "0.5rem" }}>
        <button
          type="button"
          className={`outcome-btn ${newCategory === "new" ? "sel-asked" : ""}`}
          onClick={() => setNewCategory("new")}
        >
          First evaluation — clears after 1 coach
        </button>
        <button
          type="button"
          className={`outcome-btn ${newCategory === "refresh" ? "sel-asked" : ""}`}
          onClick={() => setNewCategory("refresh")}
        >
          Re-approval — clears after 2 coaches
        </button>
        <button
          type="button"
          className={`outcome-btn ${newCategory === "computer" ? "sel-asked" : ""}`}
          onClick={() => setNewCategory("computer")}
        >
          4.5 computer rating — auto-approve + USTA 4.5C badge
        </button>
      </div>

      {err && <div className="msg err">{err}</div>}

      <div className="admin-list">
        {list.length === 0 ? (
          <p className="hint">The list is empty.</p>
        ) : (
          list.map((p) => (
            <div key={p.name} className="admin-row">
              <span>
                {p.name}{" "}
                <span className={`admin-cat ${p.category}`}>
                  {p.category === "new"
                    ? "first eval · 1 coach"
                    : p.category === "computer"
                    ? "USTA 4.5C · auto-approved"
                    : "re-approval · 2 coaches"}
                </span>
              </span>
              <button
                type="button"
                className="admin-remove"
                onClick={() => remove(p.name)}
                disabled={busy}
                aria-label={`Remove ${p.name}`}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
