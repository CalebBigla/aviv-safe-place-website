import { z } from "zod";

const text = z.string().trim().max(20000);
const title = z.string().trim().min(1).max(200);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.")
  .max(100);
const id = z.string().uuid().optional();
export const settingKeys = [
  "business_name",
  "contact_email",
  "contact_phone",
  "contact_address",
  "social_instagram",
  "social_facebook",
  "social_linkedin",
  "footer_text",
] as const;
export const settingLabels: Record<(typeof settingKeys)[number], string> = {
  business_name: "Business name (footer and search results)",
  contact_email: "Contact email",
  contact_phone: "Contact phone",
  contact_address: "Address",
  social_instagram: "Instagram link (https://)",
  social_facebook: "Facebook link (https://)",
  social_linkedin: "LinkedIn link (https://)",
  footer_text: "Footer message",
};
export const cmsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("services"),
    id,
    title,
    slug,
    description: text,
    full_description: text,
    audience: text,
    // Bookable sessions are 30 or 60 minutes (also enforced by the database).
    duration_minutes: z.union([z.literal(30), z.literal(60)], {
      error: "Sessions are 30 or 60 minutes.",
    }),
    price_minor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.literal("NGN"),
    delivery_format: text,
    published: z.boolean(),
    active: z.boolean(),
    sort_order: z.number().int(),
  }),
  z.object({
    kind: z.literal("pages"),
    id,
    slug: z.enum([
      "home",
      "about",
      "services",
      "contact",
      "book",
      "privacy",
      "terms",
      "cancellation-policy",
    ]),
    title,
    body: text,
    seo_title: z.string().max(200),
    seo_description: z.string().max(500),
    published: z.boolean(),
    content: z.record(z.string(), z.string().max(2000)),
  }),
  z.object({
    kind: z.literal("faqs"),
    id,
    question: title,
    answer: text.min(1),
    category: z.string().max(100),
    sort_order: z.number().int(),
    published: z.boolean(),
  }),
  z.object({
    kind: z.literal("public_settings"),
    key: z.enum(settingKeys),
    value: z.string().max(2000),
    published: z.boolean(),
  }),
  z.object({
    kind: z.literal("media_assets"),
    id: z.string().uuid(),
    alt_text: z.string().min(1).max(500),
    caption: z.string().max(1000),
    published: z.boolean(),
  }),
]);
export type CmsInput = z.infer<typeof cmsSchema>;
// Editable home page copy (pages.content for slug "home") and what each controls.
export const homeFields = {
  hero_eyebrow: "Hero: short line above the heading",
  hero_description: "Hero: introduction paragraph",
  intro_title: "Welcome: heading",
  intro_body: "Welcome: first paragraph",
  intro_supporting: "Welcome: second paragraph",
  values_title: "Values: heading",
  approach_title: "Booking steps: heading",
  approach_description: "Booking steps: introduction",
  cta_title: "Closing invitation: heading (shown on several pages)",
  cta_description: "Closing invitation: text",
} as const;
export type HomeField = keyof typeof homeFields;

// Pages whose body text is shown publicly. Other pages use only their SEO fields.
export const pagesWithBody = ["about", "privacy", "terms", "cancellation-policy"] as const;
