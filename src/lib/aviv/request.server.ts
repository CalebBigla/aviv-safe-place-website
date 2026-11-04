import { getRequestHeader } from "@tanstack/react-start/server";

export const sha256Hex = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

// The caller's address, read only from headers Vercel sets itself. Vercel overwrites these on
// every request; other headers such as cf-connecting-ip reach us unchanged and could be faked to
// get a fresh rate limit on each attempt, so they must not be trusted here.
export function clientAddress() {
  const forwarded =
    getRequestHeader("x-vercel-forwarded-for") ??
    getRequestHeader("x-forwarded-for") ??
    getRequestHeader("x-real-ip");
  return (forwarded?.split(",")[0] ?? "").trim().slice(0, 64);
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
