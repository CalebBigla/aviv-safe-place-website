import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { publicOrigin, randomToken, sha256Hex } from "./request.server";
import { AVIV_TIME_ZONE, formatLagosTime } from "./schedule";
import { SESSION_EARLY_ENTRY_MINUTES } from "./session-schema";

export type ConfirmationEmailResult = "sent" | "failed" | "not_configured";

const SEND_URL = "https://api.resend.com/emails";
const SEND_ATTEMPTS = 2;
const CALENDAR_TITLE = "AVIV Safe Place session";

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

const lagosDate = (instant: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: AVIV_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(instant));

// 20270315T090000Z: the UTC form that Google Calendar links and .ics files both use.
const calendarStamp = (instant: string | Date) =>
  new Date(instant)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export type ConfirmationDetails = {
  name: string;
  start: string;
  end: string;
  joinUrl: string;
  reference?: string | null;
  siteUrl: string;
  canReply: boolean;
};

function calendarDescription(details: ConfirmationDetails) {
  return [
    "Your private video session with AVIV Safe Place.",
    `Join here: ${details.joinUrl}`,
    `The room opens ${SESSION_EARLY_ENTRY_MINUTES} minutes before the start time.`,
    "This link is personal to you. Please don't share it.",
  ].join("\n");
}

export function googleCalendarUrl(details: ConfirmationDetails) {
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: CALENDAR_TITLE,
    dates: `${calendarStamp(details.start)}/${calendarStamp(details.end)}`,
    details: calendarDescription(details),
    location: details.joinUrl,
    ctz: AVIV_TIME_ZONE,
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545 limits lines to 75 octets; longer ones continue on a line that starts with a space.
function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (size + width > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

// A calendar file for Apple Calendar, Outlook and others. The UID stays the same for a booking, so
// a later email for a moved appointment updates the existing calendar entry instead of adding one.
export function calendarInvite(details: ConfirmationDetails, now = new Date()) {
  const host = new URL(details.siteUrl).hostname;
  const uid = `${details.reference ?? calendarStamp(details.start)}@${host}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AVIV Safe Place//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(uid)}`,
    `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${calendarStamp(now)}`,
    `DTSTART:${calendarStamp(details.start)}`,
    `DTEND:${calendarStamp(details.end)}`,
    `SUMMARY:${icsText(CALENDAR_TITLE)}`,
    `DESCRIPTION:${icsText(calendarDescription(details))}`,
    `LOCATION:${icsText(details.joinUrl)}`,
    `URL:${icsText(details.joinUrl)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(CALENDAR_TITLE)}`,
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(foldIcsLine)
    .join("\r\n")
    .concat("\r\n");
}

const PREPARATION = [
  "Find a quiet, private room where you won't be overheard or interrupted.",
  "Use headphones if you can. They keep the conversation private and the sound clear.",
  "Charge your device, or keep it plugged in, and use a steady internet connection.",
  "Open the link in an up-to-date browser such as Chrome, Safari or Edge, and allow it to use your camera and microphone.",
  `Try the link a little early to check everything works. You can enter the room from ${SESSION_EARLY_ENTRY_MINUTES} minutes before your start time.`,
];
const ON_THE_DAY = [
  `Open your link. The room opens ${SESSION_EARLY_ENTRY_MINUTES} minutes before your session, and your counsellor will join you there.`,
  "If you get disconnected, open the same link again to rejoin.",
];
const PRIVACY = [
  "Only you and your counsellor can join this room.",
  "Sessions are never recorded.",
  "This link is personal to you, so please don't share or forward this email.",
];

// Inboxes are often shared or previewed, so this carries appointment logistics only: never the
// type of session, the reason for counselling or any other counselling detail.
export function confirmationEmail(details: ConfirmationDetails) {
  const minutes = Math.round(
    (new Date(details.end).getTime() - new Date(details.start).getTime()) / 60000,
  );
  const date = lagosDate(details.start);
  const time = `${formatLagosTime(details.start)} – ${formatLagosTime(details.end)} (Lagos time, WAT)`;
  const calendarUrl = googleCalendarUrl(details);
  const contactUrl = `${details.siteUrl}/contact`;
  const rows: [string, string][] = [
    ["Date", date],
    ["Time", time],
    ["Length", `${minutes} minutes`],
    ["Where", "Private video call (link below)"],
  ];
  if (details.reference) rows.push(["Reference", details.reference]);

  const text = [
    `Dear ${details.name},`,
    "",
    "Your session with AVIV Safe Place is confirmed. We look forward to seeing you.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Join your private video session:",
    details.joinUrl,
    "",
    "Add it to Google Calendar:",
    calendarUrl,
    "A calendar file (aviv-session.ics) is also attached for Apple Calendar, Outlook and others.",
    "",
    "BEFORE YOUR SESSION",
    ...PREPARATION.map((line) => `- ${line}`),
    "",
    "ON THE DAY",
    ...ON_THE_DAY.map((line) => `- ${line}`),
    "",
    "YOUR PRIVACY",
    ...PRIVACY.map((line) => `- ${line}`),
    "",
    details.canReply
      ? "Need to change your time, or having trouble joining? Reply to this email and we'll help."
      : `Need to change your time, or having trouble joining? Contact us at ${contactUrl}`,
    "",
    "With warmth,",
    "AVIV Safe Place",
    "Heart Healed, Family Restored.",
    details.siteUrl,
  ].join("\n");

  const e = escapeHtml;
  const muted = "color:#55686e;";
  const section = (title: string, items: string[]) =>
    `<tr><td style="padding:24px 36px 0;"><div style="font-size:15px;font-weight:bold;margin-bottom:8px;">${e(title)}</div><ul style="margin:0;padding-left:20px;font-size:14px;line-height:22px;${muted}">${items.map((item) => `<li style="margin-bottom:6px;">${e(item)}</li>`).join("")}</ul></td></tr>`;
  const help = details.canReply
    ? "Need to change your time, or having trouble joining? Reply to this email and we'll help."
    : `Need to change your time, or having trouble joining? <a href="${e(contactUrl)}" style="color:#223a42;font-weight:bold;">Contact us</a> and we'll help.`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4efe6;">
<div style="display:none;max-height:0;overflow:hidden;">Your session on ${e(date)} is confirmed. Your private video link is inside.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#223a42;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px 36px 0;font-size:22px;font-weight:bold;">AVIV <span style="font-weight:normal;">Safe Place</span></td></tr>
<tr><td style="padding:4px 36px 0;font-size:13px;${muted}">Heart Healed, Family Restored.</td></tr>
<tr><td style="padding:28px 36px 0;font-size:16px;line-height:24px;">Dear ${e(details.name)},</td></tr>
<tr><td style="padding:10px 36px 0;font-size:16px;line-height:24px;">Your session with AVIV Safe Place is <strong>confirmed</strong>. We look forward to seeing you.</td></tr>
<tr><td style="padding:20px 36px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;border-left:3px solid #f0bcc2;border-radius:6px;">
${rows.map(([label, value]) => `<tr><td style="padding:8px 16px;font-size:13px;${muted}width:90px;vertical-align:top;">${e(label)}</td><td style="padding:8px 16px 8px 0;font-size:15px;line-height:22px;font-weight:bold;">${e(value)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td align="center" style="padding:28px 36px 0;"><a href="${e(details.joinUrl)}" style="display:inline-block;background:#223a42;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 30px;border-radius:6px;">Join your video session</a></td></tr>
<tr><td align="center" style="padding:12px 36px 0;"><a href="${e(calendarUrl)}" style="display:inline-block;background:#ffffff;color:#223a42;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 22px;border-radius:6px;border:1px solid #223a42;">Add to Google Calendar</a></td></tr>
<tr><td align="center" style="padding:10px 36px 0;font-size:12px;line-height:18px;${muted}">Using Apple Calendar or Outlook? Open the attached aviv-session.ics file.</td></tr>
${section("Before your session", PREPARATION)}
${section("On the day", ON_THE_DAY)}
${section("Your privacy", PRIVACY)}
<tr><td style="padding:24px 36px 0;"><div style="background:#f4efe6;border-radius:6px;padding:14px 16px;font-size:14px;line-height:22px;">${details.canReply ? e(help) : help}</div></td></tr>
<tr><td style="padding:20px 36px 0;font-size:12px;line-height:18px;${muted}word-break:break-all;">If the button doesn't work, copy this link into your browser: <a href="${e(details.joinUrl)}" style="color:#223a42;">${e(details.joinUrl)}</a></td></tr>
<tr><td style="padding:28px 36px 32px;font-size:14px;line-height:22px;">With warmth,<br><strong>AVIV Safe Place</strong><br><a href="${e(details.siteUrl)}" style="font-size:13px;color:#55686e;">${e(details.siteUrl.replace(/^https?:\/\//, ""))}</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  return {
    subject: `Confirmed: your AVIV Safe Place session on ${date}`,
    html,
    text,
    attachments: [
      {
        filename: "aviv-session.ics",
        content: Buffer.from(calendarInvite(details)).toString("base64"),
      },
    ],
  };
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
      // Resend's error message names the problem (for example an unverified domain) and holds no
      // secrets or client details, so it is logged to make failures diagnosable.
      const reason = (await response.json().catch(() => null)) as { message?: unknown } | null;
      console.error(
        "[aviv-email] provider refused the message",
        response.status,
        typeof reason?.message === "string" ? reason.message.slice(0, 200) : "",
      );
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
  if (!config) {
    console.error("[aviv-email] not sent: RESEND_API_KEY or EMAIL_FROM is not set");
    return "not_configured";
  }
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
  const origin = publicOrigin();
  // Administrators can read bookings, so the reference comes from the row. It is optional.
  const row = await client
    .from("bookings")
    .select("public_reference")
    .eq("id", bookingId)
    .maybeSingle();
  const sent = await send(
    config,
    String(booking["email"]),
    confirmationEmail({
      name: String(booking["name"]),
      start: String(booking["start"]),
      end: String(booking["end"]),
      joinUrl: `${origin}/session/${token}`,
      reference: row.data?.public_reference ?? null,
      siteUrl: origin,
      canReply: Boolean(config.replyTo),
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

// Sends the confirmation for an appointment that a verified payment has just confirmed. Called with
// the service client, once per payment. A failure never undoes the confirmation: the booking shows
// the failure to administrators, who can send it again from the booking page.
export async function sendPaymentConfirmationEmail(
  service: SupabaseClient<Database>,
  paymentReference: string,
): Promise<ConfirmationEmailResult> {
  const config = emailConfig();
  if (!config) {
    console.error("[aviv-email] not sent: RESEND_API_KEY or EMAIL_FROM is not set");
    return "not_configured";
  }
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const link = await service.rpc("aviv_payment_confirmation_link", {
    _reference: paymentReference,
    _session_hash: tokenHash,
  });
  const booking = link.data;
  if (link.error || !booking || typeof booking !== "object" || Array.isArray(booking)) {
    console.error("[aviv-email] link could not be created", link.error?.code ?? "not confirmed");
    return "failed";
  }
  const origin = publicOrigin();
  const sent = await send(
    config,
    String(booking["email"]),
    confirmationEmail({
      name: String(booking["name"]),
      start: String(booking["start"]),
      end: String(booking["end"]),
      joinUrl: `${origin}/session/${token}`,
      reference: typeof booking["reference"] === "string" ? booking["reference"] : null,
      siteUrl: origin,
      canReply: Boolean(config.replyTo),
    }),
    `aviv-confirmation-${tokenHash.slice(0, 40)}`,
  );
  const recorded = await service.rpc("aviv_record_payment_confirmation_email", {
    _reference: paymentReference,
    _sent: sent,
  });
  if (recorded.error) console.error("[aviv-email] result not recorded", recorded.error.code);
  return sent ? "sent" : "failed";
}
