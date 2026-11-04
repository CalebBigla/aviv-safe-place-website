// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contactSchema } from "@/lib/aviv/contact-schema";
import { confirmationEmail } from "@/lib/aviv/email.server";
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

  it("ignores headers a visitor could fake", async () => {
    requestHeaders.set("x-vercel-forwarded-for", "203.0.113.7");
    const genuine = await clientKey();
    requestHeaders.set("cf-connecting-ip", "198.51.100.1");
    expect(await clientKey()).toBe(genuine);
    expect(clientAddress()).toBe("203.0.113.7");
  });
  it("uses the first address when there are several", () => {
    requestHeaders.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    expect(clientAddress()).toBe("203.0.113.7");
  });
  it("never stores the address itself", async () => {
    requestHeaders.set("x-vercel-forwarded-for", "203.0.113.7");
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
  };
  it("gives the time in Lagos and the personal link", () => {
    const email = confirmationEmail(details);
    expect(email.html).toContain("https://example.test/session/abc123");
    expect(email.text).toContain("https://example.test/session/abc123");
    expect(email.text).toContain("10:00");
    expect(email.text).toContain("Lagos time");
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
