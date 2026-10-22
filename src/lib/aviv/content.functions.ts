import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const getPublicContent = createServerFn({ method: "GET" }).handler(async () => {
  // Vite exposes .env values prefixed with VITE_ through import.meta.env.
  // Keep process.env as the runtime fallback for deployed server environments.
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ||
    (typeof process !== "undefined" ? process.env["SUPABASE_URL"] : undefined);
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    (typeof process !== "undefined" ? process.env["SUPABASE_PUBLISHABLE_KEY"] : undefined);
  if (!url || !key) throw new Error("Content is temporarily unavailable.");
  const client = createClient<Database>(url, key, {
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
  const [services, faqs, pages, settings, media] = await Promise.all([
    client
      .from("services")
      .select(
        "slug,title,description,full_description,audience,duration_minutes,price_minor,currency,delivery_format",
      )
      .eq("published", true)
      .eq("active", true)
      .order("sort_order"),
    client.from("faqs").select("id,question,answer").eq("published", true).order("sort_order"),
    client
      .from("pages")
      .select("slug,title,body,content,seo_title,seo_description")
      .eq("published", true),
    client.from("public_settings").select("key,value").eq("published", true),
    client.from("media_assets").select("id,storage_path,alt_text,caption").eq("published", true),
  ]);
  const queryErrors = [
    ["services", services.error],
    ["faqs", faqs.error],
    ["pages", pages.error],
    ["public_settings", settings.error],
    ["media_assets", media.error],
  ] as const;
  const failures = queryErrors.flatMap(([query, error]) =>
    error ? [{ query, code: error.code, message: error.message }] : [],
  );
  if (failures.length > 0) {
    console.error("[aviv-public-content] Supabase query failed", failures);
    throw new Error("Content is temporarily unavailable.");
  }
  return {
    services: services.data ?? [],
    faqs: faqs.data ?? [],
    pages: pages.data ?? [],
    media: await Promise.all(
      (media.data ?? []).map(async (m) => ({
        ...m,
        url:
          (await client.storage.from("aviv-media").createSignedUrl(m.storage_path, 3600)).data
            ?.signedUrl ?? "",
      })),
    ),
    settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])) as Record<
      string,
      string
    >,
  };
});
