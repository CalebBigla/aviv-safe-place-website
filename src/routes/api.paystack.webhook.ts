import { createFileRoute } from "@tanstack/react-router";
import { paystackKey, settlePayment, validSignature } from "@/lib/aviv/paystack.server";
import { serviceClient } from "@/lib/aviv/request.server";

const reply = (status: number) => new Response(null, { status });

// Paystack's server-to-server notification. Only signed requests are accepted, and the payment is
// then verified with Paystack's API rather than taken from the payload. Paystack retries anything
// other than 200, so temporary failures return 500.
export const Route = createFileRoute("/api/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = paystackKey();
        if (!key) return reply(503);
        const rawBody = await request.text();
        if (!(await validSignature(key, rawBody, request.headers.get("x-paystack-signature"))))
          return reply(401);
        let event: { event?: unknown; data?: { reference?: unknown } };
        try {
          event = JSON.parse(rawBody);
        } catch {
          return reply(400);
        }
        const reference = event.data?.reference;
        if (
          event.event !== "charge.success" ||
          typeof reference !== "string" ||
          !/^AVIVPAY-[a-f0-9]{32}$/.test(reference)
        )
          return reply(200);
        let db;
        try {
          db = await serviceClient();
        } catch {
          return reply(500);
        }
        const result = await settlePayment(db, key, reference);
        return reply(result.status === "infrastructure" ? 500 : 200);
      },
    },
  },
});
