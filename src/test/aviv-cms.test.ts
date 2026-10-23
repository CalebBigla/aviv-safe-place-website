import { describe, expect, it } from "vitest";
import { cmsSchema } from "@/lib/aviv/admin-schema";
import { formatNaira, koboToNairaText, nairaToKobo } from "@/lib/aviv/format";

describe("AVIV CMS validation", () => {
  const service = {
    kind: "services",
    title: "Test",
    slug: "test",
    description: "",
    full_description: "",
    audience: "",
    duration_minutes: 60,
    price_minor: 1000000,
    currency: "NGN",
    delivery_format: "",
    published: false,
    active: false,
    sort_order: 0,
  };
  it("requires integer kobo and a 30 or 60 minute session", () => {
    expect(cmsSchema.safeParse(service).success).toBe(true);
    expect(cmsSchema.safeParse({ ...service, duration_minutes: 30 }).success).toBe(true);
    expect(cmsSchema.safeParse({ ...service, price_minor: 1.5 }).success).toBe(false);
    for (const duration_minutes of [0, 15, 45, 90, 120])
      expect(cmsSchema.safeParse({ ...service, duration_minutes }).success).toBe(false);
  });
  it("rejects secrets as public CMS setting keys", () => {
    expect(
      cmsSchema.safeParse({
        kind: "public_settings",
        key: "paystack_secret",
        value: "test",
        published: true,
      }).success,
    ).toBe(false);
  });
  it("only accepts existing public page keys", () => {
    const page = {
      kind: "pages",
      slug: "unknown",
      title: "Test",
      body: "",
      seo_title: "",
      seo_description: "",
      published: true,
      content: {},
    };
    expect(cmsSchema.safeParse(page).success).toBe(false);
    expect(cmsSchema.safeParse({ ...page, slug: "about" }).success).toBe(true);
  });
});

describe("Naira amounts", () => {
  it("converts naira text to kobo without floating-point drift", () => {
    expect(nairaToKobo("10000")).toBe(1000000);
    expect(nairaToKobo("10,000")).toBe(1000000);
    expect(nairaToKobo("0.29")).toBe(29);
    expect(nairaToKobo("25000.5")).toBe(2500050);
    expect(nairaToKobo("19.99")).toBe(1999);
    for (const bad of ["", "-5", "1.234", "abc", "1e5"]) expect(nairaToKobo(bad)).toBeNull();
  });
  it("round-trips for editing and formats consistently", () => {
    expect(koboToNairaText(2500050)).toBe("25000.50");
    expect(koboToNairaText(1000000)).toBe("10000");
    expect(nairaToKobo(koboToNairaText(1999))).toBe(1999);
    expect(formatNaira(1000000)).toMatch(/^₦\s?10,000$/);
    expect(formatNaira(2500050)).toMatch(/^₦\s?25,000\.50$/);
  });
});
