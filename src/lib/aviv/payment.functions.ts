import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { guestTokenSchema } from "./guest-booking-schema";
import { siteOrigin } from "./metadata";
import {
  paymentReferenceSchema,
  type PaymentCheckResult,
  type PaymentStartResult,
} from "./payment-schema";
import { initializeTransaction, paystackKey, settlePayment } from "./paystack.server";
import { clientKey, randomToken, serviceClient, sha256Hex } from "./request.server";

const CHECK_LIMIT_PER_HOUR = 60;

// Starts Paystack checkout for the hold behind a guest's booking link, at the booking's saved price.
export const startGuestPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => guestTokenSchema.parse(input))
  .handler(async ({ data }): Promise<PaymentStartResult> => {
    setResponseHeader("Cache-Control", "no-store");
    const key = paystackKey();
    if (!key) return { status: "not_configured" };
    let db;
    try {
      db = await serviceClient();
    } catch {
      return { status: "infrastructure" };
    }
    const reference = `AVIVPAY-${randomToken().slice(0, 32)}`;
    const begun = await db.rpc("aviv_begin_payment", {
      _manage_hash: await sha256Hex(data.token),
      _reference: reference,
      _client_key: await clientKey(),
    });
    if (begun.error) {
      console.error("[aviv-paystack] checkout could not start", begun.error.code);
      return { status: "infrastructure" };
    }
    const hold = begun.data;
    if (!hold || typeof hold !== "object" || Array.isArray(hold))
      return { status: "infrastructure" };
    if (hold["state"] !== "ready") {
      const state = hold["state"];
      return state === "paid" || state === "expired" || state === "rate_limited"
        ? { status: state }
        : { status: "unavailable" };
    }
    const origin = siteOrigin ?? new URL(getRequest().url).origin;
    const url = await initializeTransaction(key, {
      email: String(hold["email"]),
      amountMinor: Number(hold["amount_minor"]),
      currency: String(hold["currency"]),
      reference,
      callbackUrl: `${origin}/booking/success`,
    });
    return url ? { status: "redirect", url } : { status: "infrastructure" };
  });

// Called by the page Paystack returns to. It never trusts the visit itself: it asks Paystack.
export const checkGuestPayment = createServerFn({ method: "POST" })
  .validator((input: unknown) => paymentReferenceSchema.parse(input))
  .handler(async ({ data }): Promise<PaymentCheckResult> => {
    setResponseHeader("Cache-Control", "no-store");
    const key = paystackKey();
    if (!key) return { status: "not_configured" };
    let db;
    try {
      db = await serviceClient();
    } catch {
      return { status: "infrastructure" };
    }
    const limit = await db.rpc("aviv_consume_rate_limit", {
      _bucket: `payment-check:${await clientKey()}`,
      _limit: CHECK_LIMIT_PER_HOUR,
      _window_seconds: 3600,
    });
    if (limit.error) return { status: "infrastructure" };
    if (!limit.data) return { status: "rate_limited" };
    return settlePayment(db, key, data.reference);
  });
