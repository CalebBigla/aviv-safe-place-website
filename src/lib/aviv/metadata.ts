import type { getPublicContent } from "./content.functions";
import defaultShareImage from "@/assets/aviv-welcome-scene.jpg";

// Absolute URLs (canonical, og:url, og:image) need the public site origin. Without
// VITE_SITE_URL they are omitted rather than emitted as relative or wrong URLs.
export const siteOrigin = import.meta.env["VITE_SITE_URL"]?.replace(/\/+$/, "") || undefined;
const absolute = (path: string) => (siteOrigin ? `${siteOrigin}${path}` : undefined);

type Content = Awaited<ReturnType<typeof getPublicContent>> | undefined;

export function cmsPageHead(data: Content, title: string, description: string, path: string) {
  const page = data?.pages.find((p) => p.slug === (path === "/" ? "home" : path.slice(1)));
  const head = pageHead(page?.seo_title || title, page?.seo_description || description, path);
  // Share image: the CMS home cover when one is published, otherwise AVIV's default scene.
  const home = data?.pages.find((p) => p.slug === "home")?.content;
  const coverId =
    home && typeof home === "object" && !Array.isArray(home) ? home["hero_media_id"] : undefined;
  const cover = data?.media.find((m) => m.id === coverId);
  const image = absolute(cover?.url ?? defaultShareImage);
  if (image)
    head.meta.push(
      { property: "og:image", content: image },
      {
        property: "og:image:alt",
        content: cover?.alt_text ?? "A sunlit, welcoming room at AVIV Safe Place",
      },
      { name: "twitter:image", content: image },
    );
  return head;
}

export function pageHead(title: string, description: string, path: string, privatePage = false) {
  const url = privatePage ? undefined : absolute(path);
  return {
    meta: [
      { title: `${title} | AVIV Safe Place` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | AVIV Safe Place` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "AVIV Safe Place" },
      ...(url ? [{ property: "og:url", content: url }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      ...(privatePage
        ? [
            { name: "robots", content: "noindex, nofollow" },
            { name: "referrer", content: "no-referrer" },
          ]
        : []),
    ],
    links: url ? [{ rel: "canonical", href: url }] : [],
  };
}

// Public pages listed in the sitemap.
export const publicPaths = [
  "/",
  "/services",
  "/about",
  "/contact",
  "/book",
  "/privacy",
  "/terms",
  "/cancellation-policy",
];
