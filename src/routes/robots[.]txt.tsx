import { createFileRoute } from "@tanstack/react-router";
import { siteOrigin } from "@/lib/aviv/metadata";

// Private areas are also protected by authentication or bearer tokens and carry noindex;
// these rules only keep well-behaved crawlers away.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteOrigin ?? new URL(request.url).origin;
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "Disallow: /api/",
          "Disallow: /booking/",
          "Disallow: /session/",
          "Disallow: /reset-password",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
