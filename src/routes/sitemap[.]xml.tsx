import { createFileRoute } from "@tanstack/react-router";
import { publicPaths, siteOrigin } from "@/lib/aviv/metadata";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = siteOrigin ?? new URL(request.url).origin;
        const urls = publicPaths
          .map((path) => `  <url><loc>${origin}${path}</loc></url>`)
          .join("\n");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
          {
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, max-age=3600",
            },
          },
        );
      },
    },
  },
});
