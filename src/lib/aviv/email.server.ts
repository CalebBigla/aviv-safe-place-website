import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { siteOrigin } from "./metadata";
import { randomToken, sha256Hex } from "./request.server";
import { formatLagosDateTime, formatLagosTime } from "./schedule";
import { SESSION_EARLY_ENTRY_MINUTES } from "./session-schema";

export type ConfirmationEmailResult = "sent" | "failed" | "not_configured";

const SEND_URL = "https://api.resend.com/emails";
const SEND_ATTEMPTS = 2;

export function emailConfig() {
  const apiKey = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["EMAIL_FROM"]?.trim();
  return apiKey && from
    ? { apiKey, from, replyTo: process.env["EMAIL_REPLY_TO"]?.trim() || undefined }
    : null;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Inboxes are often shared or previewed, so this names the time and link only: never the type of
// session, the reason for counselling or any other counselling detail.
export function confirmationEmail(details: {
  name: string;
  start: string;
  end: string;
  joinUrl: string;
}) {
  const when = `${formatLagosDateTime(details.start)} – ${formatLagosTime(details.end)} (Lagos time)`;
  const name = escapeHtml(details.name);
  const url = escapeHtml(details.joinUrl);
  const text = [
    `Dear ${details.name},`,
    "",
    "Your session with AVIV Safe Place is confirmed.",
    "",
    when,
    "",
    "Join your private video session:",
    details.joinUrl,
    "",
    `The room opens ${SESSION_EARLY_ENTRY_MINUTES} minutes before your session. Please find a quiet, private place and allow your browser to use your camera and microphone.`,
    "",
    "This link is personal to you, so please don't share it. Sessions are not recorded.",
    "",
    "AVIV Safe Place",
    "Heart Healed, Family Restored.",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4efe6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#223a42;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:36px 36px 8px;font-size:22px;font-weight:bold;">AVIV <span style="font-weight:normal;">Safe Place</span></td></tr>
<tr><td style="padding:16px 36px 0;font-size:16px;line-height:24px;">Dear ${name},</td></tr>
<tr><td style="padding:12px 36px 0;font-size:16px;line-height:24px;">Your session with AVIV Safe Place is confirmed.</td></tr>
<tr><td style="padding:20px 36px 0;"><div style="background:#f4efe6;border-left:3px solid #f0bcc2;border-radius:4px;padding:14px 16px;font-size:15px;line-height:22px;">${escapeHtml(when)}</div></td></tr>
<tr><td align="center" style="padding:28px 36px 8px;"><a href="${url}" style="display:inline-block;background:#223a42;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:6px;">Join your video session</a></td></tr>
<tr><td style="padding:16px 36px 0;font-size:14px;line-height:22px;color:#55686e;">The room opens ${SESSION_EARLY_ENTRY_MINUTES} minutes before your session. Please find a quiet, private place and allow your browser to use your camera and microphone.</td></tr>
<tr><td style="padding:12px 36px 0;font-size:14px;line-height:22px;color:#55686e;">This link is personal to you, so please don't share it. Sessions are not recorded.</td></tr>
<tr><td style="padding:12px 36px 0;font-size:12px;line-height:18px;color:#55686e;word-break:break-all;">If the button doesn't work, open this link: <a href="${url}" style="color:#223a42;">${url}</a></td></tr>
<tr><td style="padding:28px 36px 36px;font-size:13px;line-height:20px;color:#55686e;">AVIV Safe Place<br>Heart Healed, Family Restored.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return { subject: "Your AVIV Safe Place session is confirmed", html, text };
}

// Retries reuse the idempotency key, so a retry after a dropped response can't send twice.
async function send(
  config: NonNullable<ReturnType<typeof emailConfig>>,
  to: string,
  message: ReturnType<typeof confirmationEmail>,
  idempotencyKey: string,
) {
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(SEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          from: config.from,
          to: [to],
          reply_to: config.replyTo,
          ...message,
        }),
      });
      if (response.ok) return true;
      console.error("[aviv-email] provider refused the message", response.status);
      if (response.status < 500 && response.status !== 429) return false;
    } catch {
      console.error("[aviv-email] provider unreachable");
    }
  }
  return false;
}

// Creates a fresh session link and emails it. A failure never undoes the confirmation:
// the administrator is told and can send it again from the booking page.
export async function sendConfirmationEmail(
  client: SupabaseClient<Database>,
  bookingId: string,
): Promise<ConfirmationEmailResult> {
  const config = emailConfig();
  if (!config) return "not_configured";
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const link = await client.rpc("aviv_admin_confirmation_link", {
    _id: bookingId,
    _session_hash: tokenHash,
  });
  const booking = link.data;
  if (link.error || !booking || typeof booking !== "object" || Array.isArray(booking)) {
    console.error("[aviv-email] link could not be created", link.error?.code);
    return "failed";
  }
  const origin = siteOrigin ?? new URL(getRequest().url).origin;
  const sent = await send(
    config,
    String(booking["email"]),
    confirmationEmail({
      name: String(booking["name"]),
      start: String(booking["start"]),
      end: String(booking["end"]),
      joinUrl: `${origin}/session/${token}`,
    }),
    `aviv-confirmation-${tokenHash.slice(0, 40)}`,
  );
  const recorded = await client.rpc("aviv_admin_record_confirmation_email", {
    _id: bookingId,
    _sent: sent,
  });
  if (recorded.error) console.error("[aviv-email] result not recorded", recorded.error.code);
  return sent ? "sent" : "failed";
}
