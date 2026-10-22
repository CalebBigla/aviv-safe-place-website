import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Publishable-key client for server-side reads of public, RLS-filtered data.
export function publicClient() {
  // Vite exposes .env values prefixed with VITE_ through import.meta.env.
  // Keep process.env as the runtime fallback for deployed server environments.
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ||
    (typeof process !== "undefined" ? process.env["SUPABASE_URL"] : undefined);
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    (typeof process !== "undefined" ? process.env["SUPABASE_PUBLISHABLE_KEY"] : undefined);
  if (!url || !key) throw new Error("Content is temporarily unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}
