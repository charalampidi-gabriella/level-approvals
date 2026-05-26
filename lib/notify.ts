// Best-effort email notification on a new entry. Never throws — a failed
// send must not block logging (see CLAUDE.md "Never blocks").
//
// Using a Resend-owned sender (no domain DNS verification available), so:
//   - `from` must be an @resend.dev address.
//   - Resend will only DELIVER to the email that owns the Resend account.
//     That means NOTIFY_TO has to be that account-owner address.
//   - Replies go to a real Rippner address via `replyTo`.

import { Resend } from "resend";
import type { Evaluation } from "@/app/actions";

const FROM = process.env.NOTIFY_FROM ?? "Rippner Approvals <onboarding@resend.dev>";
const REPLY_TO = process.env.NOTIFY_REPLY_TO ?? "info@rippnertennis.com";
// Comma-separated list. With the resend.dev sender this must be the Resend
// account-owner email or delivery is rejected.
const TO = (process.env.NOTIFY_TO ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function notifyNewEntry(entry: Evaluation): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || TO.length === 0) return; // not configured — silently skip

  try {
    const resend = new Resend(key);
    const subject = `New entry: ${entry.player} — ${entry.outcome}`;
    const lines = [
      `Player: ${entry.player}`,
      `Outcome: ${entry.outcome}`,
      entry.attendedLevel ? `Attended level: ${entry.attendedLevel}` : null,
      entry.correctLevel ? `Should be in: ${entry.correctLevel}` : null,
      `Coach: ${entry.coach}`,
      entry.note ? `Feedback: ${entry.note}` : null,
      `Logged: ${new Date(entry.date).toLocaleString()}`,
    ].filter(Boolean);

    await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: REPLY_TO,
      subject,
      text: lines.join("\n"),
    });
  } catch (err) {
    // Log and move on — the entry is already saved.
    console.error("notifyNewEntry failed:", err);
  }
}
