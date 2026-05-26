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

// Brand colors (see Rippner CLAUDE.md).
const NAVY = "#1b4458";
const GREEN = "#95d600";
const DANGER = "#d64545";
const AMBER = "#f4b400";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Badge color keyed to the outcome type.
function badgeColors(outcome: string): { bg: string; fg: string } {
  if (outcome.startsWith("Approved")) return { bg: GREEN, fg: "#1a2e00" };
  if (outcome.startsWith("Denied")) return { bg: DANGER, fg: "#ffffff" };
  return { bg: AMBER, fg: "#4a3500" }; // wrong class
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:8px 0;color:#6b7c84;font-size:13px;width:130px;vertical-align:top;">${esc(label)}</td>
      <td style="padding:8px 0;color:${NAVY};font-size:14px;font-weight:600;">${esc(value)}</td>
    </tr>`;
}

function buildHtml(entry: Evaluation): string {
  const { bg, fg } = badgeColors(entry.outcome);
  const logged = new Date(entry.date).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const detailRows = [
    entry.attendedLevel ? row("Attended", entry.attendedLevel) : "",
    entry.correctLevel ? row("Should be in", entry.correctLevel) : "",
    row("Coach", entry.coach),
    row("Logged", `${logged} CT`),
  ].join("");

  const noteBlock = entry.note
    ? `<tr><td colspan="2" style="padding-top:14px;">
         <div style="color:#6b7c84;font-size:13px;margin-bottom:4px;">Feedback</div>
         <div style="background:#F1F5F5;border-radius:8px;padding:12px 14px;color:${NAVY};font-size:14px;line-height:1.5;">${esc(
           entry.note
         )}</div>
       </td></tr>`
    : "";

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#eef2f3;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f3;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${NAVY};padding:20px 28px;">
            <div style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">RIPPNER TENNIS</div>
            <div style="color:${GREEN};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-top:2px;">Level Log · New Entry</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="font-size:20px;font-weight:700;color:${NAVY};margin-bottom:14px;">${esc(
              entry.player
            )}</div>
            <span style="display:inline-block;background:${bg};color:${fg};font-size:13px;font-weight:700;padding:5px 12px;border-radius:999px;">${esc(
              entry.outcome
            )}</span>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-top:1px solid #e3e9ea;">
              ${detailRows}
              ${noteBlock}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#F1F5F5;color:#6b7c84;font-size:12px;">
            Logged in the Rippner Level Log. Reply to this email to reach the team.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function notifyNewEntry(entry: Evaluation): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || TO.length === 0) return; // not configured — silently skip

  try {
    const resend = new Resend(key);
    const subject = `New entry: ${entry.player} — ${entry.outcome}`;

    // Plain-text fallback for clients that don't render HTML.
    const text = [
      `Player: ${entry.player}`,
      `Outcome: ${entry.outcome}`,
      entry.attendedLevel ? `Attended level: ${entry.attendedLevel}` : null,
      entry.correctLevel ? `Should be in: ${entry.correctLevel}` : null,
      `Coach: ${entry.coach}`,
      entry.note ? `Feedback: ${entry.note}` : null,
      `Logged: ${new Date(entry.date).toLocaleString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: REPLY_TO,
      subject,
      text,
      html: buildHtml(entry),
    });
  } catch (err) {
    // Log and move on — the entry is already saved.
    console.error("notifyNewEntry failed:", err);
  }
}
