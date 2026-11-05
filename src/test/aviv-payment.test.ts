// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentReferenceSchema } from "@/lib/aviv/payment-schema";
import {
  initializeTransaction,
  paystackKey,
  validSignature,
  verifyTransaction,
} from "@/lib/aviv/paystack.server";

const key = "sk_test_abc123";
const reference = `AVIVPAY-${"a".repeat(32)}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Paystack configuration", () => {
  it("accepts only real-looking secret keys", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect(paystackKey()).toBeNull();
    vi.stubEnv("PAYSTACK_SECRET_KEY", "pk_test_public");
    expect(paystackKey()).toBeNull();
    vi.stubEnv("PAYSTACK_SECRET_KEY", " sk_live_xyz ");
    expect(paystackKey()).toBe("sk_live_xyz");
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference } });
  const sign = (text: string, secret = key) =>
    createHmac("sha512", secret).update(text).digest("hex");

  it("accepts Paystack's signature over the exact body", async () => {
    expect(await validSignature(key, body, sign(body))).toBe(true);
    expect(await validSignature(key, body, sign(body).toUpperCase())).toBe(true);
  });
  it("refuses tampered bodies, other keys and missing or malformed signatures", async () => {
    expect(await validSignature(key, `${body} `, sign(body))).toBe(false);
    expect(await validSignature(key, body, sign(body, "sk_test_other"))).toBe(false);
    expect(await validSignature(key, body, null)).toBe(false);
    expect(await validSignature(key, body, "abc")).toBe(false);
    expect(await validSignature(key, body, sign(body).slice(0, 126))).toBe(false);
  });
});

describe("Paystack requests", () => {
  it("starts checkout for the stated amount without sending client details beyond the email", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Response.json({ status: true, data: { authorization_url: "https://checkout.paystack.com/x" } });
    });
    const url = await initializeTransaction(key, {
      email: "guest@example.org",
      amountMinor: 2500000,
      currency: "NGN",
      reference,
      callbackUrl: "https://example.test/booking/success",
    });
    expect(url).toBe("https://checkout.paystack.com/x");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({
      email: "guest@example.org",
      amount: "2500000",
      currency: "NGN",
      reference,
      callback_url: "https://example.test/booking/success",
    });
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Bearer ${key}`);
  });
  it("refuses a checkout link that isn't HTTPS", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ status: true, data: { authorization_url: "javascript:alert(1)" } }),
    );
    expect(
      await initializeTransaction(key, {
        email: "a@b.co",
        amountMinor: 1,
        currency: "NGN",
        reference,
        callbackUrl: "https://example.test/booking/success",
      }),
    ).toBeNull();
  });
  it("only treats a matching, successful transaction as paid", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        status: true,
        data: { status: "success", reference, amount: 2500000, currency: "NGN", id: 7, channel: "card" },
      }),
    );
    const paid = await verifyTransaction(key, reference);
    expect(paid?.succeeded).toBe(true);
    expect(paid?.amountMinor).toBe(2500000);
    expect(paid?.details).toEqual({ paystack_id: 7, paid_at: null, channel: "card", mode: "test" });
    vi.stubGlobal("fetch", async () =>
      Response.json({ status: true, data: { status: "abandoned", reference, amount: 2500000 } }),
    );
    expect((await verifyTransaction(key, reference))?.succeeded).toBe(false);
    vi.stubGlobal("fetch", async () =>
      Response.json({ status: true, data: { status: "success", reference: "OTHER", amount: 1 } }),
    );
    expect((await verifyTransaction(key, reference))?.succeeded).toBe(false);
    vi.stubGlobal("fetch", async () => new Response("down", { status: 502 }));
    expect(await verifyTransaction(key, reference)).toBeNull();
  });
});

describe("payment references", () => {
  it("accept only the server's own format", () => {
    expect(paymentReferenceSchema.safeParse({ reference }).success).toBe(true);
    expect(paymentReferenceSchema.safeParse({ reference: "T123456" }).success).toBe(false);
    expect(paymentReferenceSchema.safeParse({ reference: `${reference}x` }).success).toBe(false);
  });
});
