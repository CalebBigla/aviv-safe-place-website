import { createFileRoute } from "@tanstack/react-router";
import { publicClient } from "@/lib/aviv/public-client";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () =>
  new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

// Stable public URL for published CMS images (page images and social previews), so they
// never depend on short-lived signed URLs. Reads use the publishable key: storage RLS only
// allows objects whose media_assets row is published, and the bucket itself stays private.
export const Route = createFileRoute("/media/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!uuid.test(params.id)) return notFound();
        const client = publicClient();
        const asset = await client
          .from("media_assets")
          .select("storage_path,mime_type")
          .eq("id", params.id)
          .eq("published", true)
          .maybeSingle();
        if (asset.error || !asset.data) return notFound();
        const file = await client.storage.from("aviv-media").download(asset.data.storage_path);
        if (file.error || !file.data) return notFound();
        return new Response(file.data, {
          headers: {
            "content-type": asset.data.mime_type,
            // An unpublished image disappears from caches within the hour.
            "cache-control": "public, max-age=3600, s-maxage=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
