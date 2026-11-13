import { createFileRoute } from "@tanstack/react-router";

const healthy = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Uptime checks and Render's health check. Deliberately touches nothing else (no database, no
// providers), so frequent pings cost nothing and reveal nothing.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: healthy,
      HEAD: () => new Response(null, { headers: { "cache-control": "no-store" } }),
    },
  },
});
