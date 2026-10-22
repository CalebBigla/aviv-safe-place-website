import { z } from "zod";

const text = z.string().trim().max(20000);
const title = z.string().trim().min(1).max(200);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.")
  .max(100);
const id = z.string().uuid().optional();
export const cmsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("services"),
    id,
    title,
    slug,
    description: text,
    full_description: text,
    audience: text,
    duration_minutes: z.number().int().positive().max(480),
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
    content: z.record(z.string().max(2000)),
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
    key: z.enum([
      "business_name",
      "contact_email",
      "contact_phone",
      "contact_address",
      "social_instagram",
      "social_facebook",
      "social_linkedin",
      "footer_text",
    ]),
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
export const homeFields = [
  "hero_eyebrow",
  "hero_title",
  "hero_description",
  "intro_title",
  "intro_body",
  "intro_supporting",
  "values_title",
  "approach_title",
  "approach_description",
  "cta_title",
  "cta_description",
] as const;
