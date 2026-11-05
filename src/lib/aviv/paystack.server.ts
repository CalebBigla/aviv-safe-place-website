import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PaymentCheckResult } from "./payment-schema";

const API = "https://api.paystack.co";
const KEY_FORMAT = /^sk_(test|live)_[A-Za-z0-9]+$/;

export function paystackKey() {
  const key = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  return key && KEY_FORMAT.test(key) ? key : null;
}

async function paystack(key: string, path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  });
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    data?: Record<string, unknown>;
  } | null;
  if (!response.ok || !body?.status || !body.data) {
    console.error("[aviv-paystack] request refused", path.split("/")[1], response.status);
    return null;
  }
  return body.data;
}

// Starts a hosted checkout. No client details go to Paystack beyond the email it requires.
export async function initializeTransaction(
  key: string,
  details: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
  },
) {
  const data = await paystack(key, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: details.email,
      amount: String(details.amountMinor),
      currency: details.currency,
      reference: details.reference,
      callback_url: details.callbackUrl,
    }),
  });
  const url = data?.["authorization_url"];
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

// Asks Paystack directly whether a payment succeeded. Webhook payloads and return-page visits are
// only ever treated as a hint to call this.
export async function verifyTransaction(key: string, reference: string) {
  const data = await paystack(key, `/transaction/verify/${encodeURIComponent(reference)}`);
  if (!data) return null;
  return {
    succeeded: data["status"] === "success" && data["reference"] === reference,
    amountMinor: Number(data["amount"]),
    currency: String(data["currency"]),
    // Recorded for reconciliation. Never card details: Paystack keeps those.
    details: {
      paystack_id: typeof data["id"] === "number" ? data["id"] : null,
      paid_at: typeof data["paid_at"] === "string" ? data["paid_at"] : null,
      channel: typeof data["channel"] === "string" ? data["channel"] : null,
      mode: key.startsWith("sk_live_") ? "live" : "test",
    },
  };
}

// Paystack signs each webhook with HMAC-SHA512 of the raw body, keyed with the secret key.
export async function validSignature(key: string, rawBody: string, signature: string | null) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const hmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(rawBody)),
  );
  const given = Uint8Array.from(signature.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  if (given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected[i]! ^ given[i]!;
  return difference === 0;
}

// Verifies a payment with Paystack and applies it once. Safe to call repeatedly.
export async function settlePayment(
  db: SupabaseClient<Database>,
  key: string,
  reference: string,
): Promise<PaymentCheckResult> {
  const verified = await verifyTransaction(key, reference);
  if (!verified) return { status: "infrastructure" };
  if (!verified.succeeded) return { status: "not_paid" };
  const result = await db.rpc("aviv_record_payment", {
    _reference: reference,
    _amount_minor: verified.amountMinor,
    _currency: verified.currency,
    _details: verified.details,
  });
  if (result.error) {
    console.error("[aviv-paystack] payment could not be recorded", result.error.code);
    return { status: "infrastructure" };
  }
  const state =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? result.data["state"]
      : null;
  if (state === "mismatch") {
    console.error("[aviv-paystack] amount or currency did not match the booking");
    return { status: "review" };
  }
  return state === "paid" ||
    state === "late" ||
    state === "duplicate" ||
    state === "review" ||
    state === "unknown"
    ? { status: state }
    : { status: "infrastructure" };
}
