import { getRequestHeader } from "@tanstack/react-start/server";

export const sha256Hex = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

// Rate-limit key for the calling client. Cloudflare sets cf-connecting-ip; other proxies
// x-forwarded-for. Only a hash is stored, never the address itself. Requests without a
// client address share one bucket, which fails safe (stricter) rather than open.
export async function clientKey() {
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0];
  const address = (
    getRequestHeader("cf-connecting-ip") ??
    forwarded ??
    getRequestHeader("x-real-ip") ??
    ""
  )
    .trim()
    .slice(0, 64);
  return `ip:${(await sha256Hex(`aviv-client:${address || "unknown"}`)).slice(0, 32)}`;
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
