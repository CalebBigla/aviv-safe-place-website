import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { siteOrigin } from "./metadata";

export const sha256Hex = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

// The caller's address, read only from what the host's own proxy sets, because anything else can
// be faked to get a fresh rate limit on each attempt.
// - Vercel overwrites x-vercel-forwarded-for. Elsewhere a visitor can send that header, so it is
//   trusted only when running on Vercel.
// - Render appends the address it saw to x-forwarded-for but keeps whatever the visitor sent in
//   front, so only the last entry is trustworthy.
// cf-connecting-ip and similar are never trusted.
export function clientAddress() {
  const vercel = process.env["VERCEL"] ? getRequestHeader("x-vercel-forwarded-for") : undefined;
  const address = vercel
    ? vercel.split(",")[0]
    : getRequestHeader("x-forwarded-for")?.split(",").at(-1);
  return (address ?? "").trim().slice(0, 64);
}

// The site's public address for links in emails and the Paystack return URL. Behind a proxy the
// request itself can carry an internal address or plain http, so the configured URL comes first.
export function publicOrigin() {
  return (
    siteOrigin ??
    process.env["RENDER_EXTERNAL_URL"]?.replace(/\/+$/, "") ??
    new URL(getRequest().url).origin
  );
}

// Rate-limit key for the calling client. Only a hash is stored, never the address itself.
// Requests without a client address share one bucket, which fails safe (stricter) rather than open.
export async function clientKey() {
  return `ip:${(await sha256Hex(`aviv-client:${clientAddress() || "unknown"}`)).slice(0, 32)}`;
}

// 256-bit random bearer token. Returned to the guest once; only its SHA-256 hash is stored.
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

export async function serviceClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
