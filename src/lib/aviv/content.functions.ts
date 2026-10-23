import { createServerFn } from "@tanstack/react-start";
import { publicClient } from "./public-client";

export const getPublicContent = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
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
    client.from("media_assets").select("id,alt_text").eq("published", true),
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
    // Published images are served from a stable same-origin URL (see routes/media.$id.tsx).
    media: (media.data ?? []).map((m) => ({ ...m, url: `/media/${m.id}` })),
    settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])) as Record<
      string,
      string
    >,
  };
});
