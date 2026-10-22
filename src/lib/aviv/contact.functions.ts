import { createServerFn } from "@tanstack/react-start";
import { contactSchema } from "./contact-schema";
import { clientKey, serviceClient, sha256Hex } from "./request.server";

type ContactResult = { sent: boolean; reason?: "rate_limited" | "infrastructure"; message: string };

const unavailable: ContactResult = {
  sent: false,
  reason: "infrastructure",
  message: "Your enquiry could not be sent right now. Please try again later.",
};

export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<ContactResult> => {
    // Honeypot: look like a normal failure so automated submitters learn nothing.
    if (data.website) return { sent: false, message: "Your message could not be sent." };
    let db;
    try {
      db = await serviceClient();
    } catch {
      return unavailable;
    }
    const buckets = [
      { _bucket: `contact:${await clientKey()}`, _limit: 5, _window_seconds: 3600 },
      {
        _bucket: `contact:email:${await sha256Hex(data.email.toLowerCase())}`,
        _limit: 3,
        _window_seconds: 3600,
      },
    ];
    for (const bucket of buckets) {
      const limit = await db.rpc("aviv_consume_rate_limit", bucket);
      if (limit.error) {
        console.error("[aviv-contact] rate limit check failed", limit.error.code);
        return unavailable;
      }
      if (!limit.data)
        return {
          sent: false,
          reason: "rate_limited",
          message:
            "You've sent several messages recently. Please wait an hour before trying again.",
        };
    }
    const result = await db.from("contact_submissions").insert({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });
    if (result.error) {
      console.error("[aviv-contact] enquiry insert failed", result.error.code);
      return unavailable;
    }
    return {
      sent: true,
      message:
        "Thank you. Your enquiry has been received by the AVIV team. Email notifications are not enabled yet, so please allow time for a reply.",
    };
  });
