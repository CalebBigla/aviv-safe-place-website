const origin = import.meta.env["VITE_SITE_URL"]?.replace(/\/+$/, "");
import type { getPublicContent } from "./content.functions";
export function cmsPageHead(
  data: Awaited<ReturnType<typeof getPublicContent>> | undefined,
  title: string,
  description: string,
  path: string,
) {
  const page = data?.pages.find((p) => p.slug === (path === "/" ? "home" : path.slice(1)));
  const head = pageHead(page?.seo_title || title, page?.seo_description || description, path);
  const content = page?.content;
  const mediaId =
    content && typeof content === "object" && !Array.isArray(content)
      ? content["hero_media_id"]
      : undefined;
  const image = data?.media.find((m) => m.id === mediaId)?.url;
  if (image?.startsWith("https://"))
    head.meta.push(
      { property: "og:image", content: image },
      { name: "twitter:image", content: image },
    );
  return head;
}
export function pageHead(title: string, description: string, path: string, privatePage = false) {
  return {
    meta: [
      { title: `${title} | AVIV Safe Place` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | AVIV Safe Place` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(privatePage
        ? [
            { name: "robots", content: "noindex, nofollow" },
            { name: "referrer", content: "no-referrer" },
          ]
        : []),
    ],
    links: !privatePage && origin ? [{ rel: "canonical", href: `${origin}${path}` }] : [],
  };
}
