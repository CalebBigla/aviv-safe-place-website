// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactSchema } from "@/lib/aviv/contact-schema";
import { calendarInvite, confirmationEmail, googleCalendarUrl } from "@/lib/aviv/email.server";
import { clientAddress, clientKey } from "@/lib/aviv/request.server";
import { contentSecurityPolicy, securityHeaders } from "@/lib/aviv/security-headers";
import { passesBotCheck } from "@/lib/aviv/turnstile.server";

const requestHeaders = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => requestHeaders.get(name),
  getRequest: () => new Request("https://example.test/"),
}));

describe("client address for rate limits", () => {
  beforeEach(() => requestHeaders.clear());
  afterEach(() => vi.unstubAllEnvs());

  it("on Vercel, uses Vercel's header and ignores ones a visitor could fake", async () => {
    vi.stubEnv("VERCEL", "1");
    requestHeaders.set("x-vercel-forwarded-for", "203.0.113.7");
    const genuine = await clientKey();
    requestHeaders.set("cf-connecting-ip", "198.51.100.1");
    requestHeaders.set("x-forwarded-for", "198.51.100.2");
    expect(await clientKey()).toBe(genuine);
    expect(clientAddress()).toBe("203.0.113.7");
  });
  it("elsewhere, trusts only the address the host's proxy appended last", () => {
    vi.stubEnv("VERCEL", "");
    // A visitor sent a fake address; Render appended the real one after it.
    requestHeaders.set("x-forwarded-for", "198.51.100.66, 203.0.113.7");
    expect(clientAddress()).toBe("203.0.113.7");
  });
  it("ignores a faked Vercel header when not running on Vercel", () => {
    vi.stubEnv("VERCEL", "");
    requestHeaders.set("x-vercel-forwarded-for", "198.51.100.66");
    requestHeaders.set("x-forwarded-for", "203.0.113.7");
    expect(clientAddress()).toBe("203.0.113.7");
  });
  it("never stores the address itself", async () => {
    requestHeaders.set("x-forwarded-for", "203.0.113.7");
    expect(await clientKey()).not.toContain("203.0.113.7");
  });
  it("makes clients with no address share one bucket", async () => {
    const first = await clientKey();
    expect(clientAddress()).toBe("");
    expect(await clientKey()).toBe(first);
  });
});

describe("security headers", () => {
  it("protects every page", () => {
    const headers = securityHeaders("/", false);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["Permissions-Policy"]).toContain("camera=(self)");
    expect(headers["Permissions-Policy"]).toContain("microphone=(self)");
  });
  it.each(["/session/abc", "/booking/manage/abc", "/admin", "/admin/bookings", "/reset-password"])(
    "never caches the private page %s",
    (path) => {
      expect(securityHeaders(path, true)).toHaveProperty("Cache-Control", "no-store");
    },
  );
  it.each(["/", "/services", "/book", "/administration"])("leaves %s cacheable", (path) => {
    expect(securityHeaders(path, true)).not.toHaveProperty("Cache-Control");
  });
  it("applies the content policy and HTTPS only in production", () => {
    expect(securityHeaders("/", false)).not.toHaveProperty("Content-Security-Policy");
    expect(securityHeaders("/", true)).toHaveProperty(
      "Content-Security-Policy",
      contentSecurityPolicy,
    );
    expect(securityHeaders("/", true)).toHaveProperty("Strict-Transport-Security");
  });
  it("refuses framing and only allows the services the site uses", () => {
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("wss://*.agora.io:*");
    expect(contentSecurityPolicy).not.toMatch(/script-src[^;]*\*/);
  });
});

describe("bot check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("stays out of the way until configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await passesBotCheck(undefined)).toBe(true);
  });
  it("refuses a missing token once configured, without calling the verifier", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const verifier = vi.fn();
    vi.stubGlobal("fetch", verifier);
    expect(await passesBotCheck(undefined)).toBe(false);
    expect(verifier).not.toHaveBeenCalled();
  });
  it("follows the verifier's answer", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", async () => Response.json({ success: true }));
    expect(await passesBotCheck("token")).toBe(true);
    vi.stubGlobal("fetch", async () => Response.json({ success: false }));
    expect(await passesBotCheck("token")).toBe(false);
  });
  it("refuses the request if the verifier is unreachable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(await passesBotCheck("token")).toBe(false);
  });
});

describe("confirmation email", () => {
  const details = {
    name: "Ada Obi",
    start: "2027-03-15T09:00:00Z",
    end: "2027-03-15T10:00:00Z",
    joinUrl: "https://example.test/session/abc123",
    reference: "AVIV-7K2Q",
    siteUrl: "https://example.test",
    canReply: true,
  };
  it("gives the date, time in Lagos, length, reference and personal link", () => {
    const email = confirmationEmail(details);
    expect(email.html).toContain("https://example.test/session/abc123");
    expect(email.text).toContain("https://example.test/session/abc123");
    expect(email.text).toContain("Monday, 15 March 2027");
    expect(email.text).toContain("10:00");
    expect(email.text).toContain("Lagos time");
    expect(email.text).toContain("60 minutes");
    expect(email.text).toContain("AVIV-7K2Q");
  });
  it("offers a Google Calendar entry at the right UTC time", () => {
    const url = new URL(googleCalendarUrl(details));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20270315T090000Z/20270315T100000Z");
    expect(url.searchParams.get("details")).toContain("https://example.test/session/abc123");
    expect(confirmationEmail(details).html).toContain("Add to Google Calendar");
  });
  it("attaches a valid calendar file that keeps one entry per booking", () => {
    const ics = calendarInvite(details, new Date("2027-03-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270315T090000Z");
    expect(ics).toContain("UID:AVIV-7K2Q@example.test");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
    const [attachment] = confirmationEmail(details).attachments;
    expect(attachment?.filename).toBe("aviv-session.ics");
    expect(Buffer.from(attachment!.content, "base64").toString()).toContain("BEGIN:VCALENDAR");
  });
  it("never names the type of session", () => {
    const email = confirmationEmail(details);
    expect(email.text.toLowerCase()).not.toMatch(/marriage|grief|trauma|family therapy/);
  });
  it("points to the contact page when replies aren't set up", () => {
    expect(confirmationEmail({ ...details, canReply: false }).text).toContain(
      "https://example.test/contact",
    );
  });
  it("keeps the subject free of personal details", () => {
    const email = confirmationEmail(details);
    expect(email.subject).not.toContain("Ada");
    expect(email.subject).not.toContain("abc123");
  });
  it("cannot be used to inject content through a client's name", () => {
    const email = confirmationEmail({ ...details, name: '<img src=x onerror="alert(1)">' });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img");
  });
});

describe("contact form schema", () => {
  it("accepts the optional bot-check token and rejects an oversized one", () => {
    const valid = { name: "A", email: "a@b.co", subject: "S", message: "M", website: "" };
    expect(contactSchema.safeParse(valid).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, turnstileToken: "t" }).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, turnstileToken: "t".repeat(3000) }).success).toBe(
      false,
    );
  });
});
