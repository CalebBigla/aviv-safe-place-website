import { createServerFn } from "@tanstack/react-start";
import { contactSchema } from "./contact-schema";
import { clientKey, sha256Hex } from "./request.server";
import { publicClient } from "./public-client";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContactResult = { sent: boolean; reason?: "rate_limited" | "infrastructure"; message: string };

const unavailable: ContactResult = {
  sent: false,
  reason: "infrastructure",
  message: "Your enquiry could not be sent right now. Please try again later.",
};

export const submitContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<ContactResult> => {
    // Honeypot: look like a normal failure so automated submitters learn nothing.
    if (data.website) return { sent: false, message: "Your message could not be sent." };

    // Use the public client — the SECURITY DEFINER RPC handles writes and rate limiting
    // internally without needing the service role key in the runtime environment.
    const db = publicClient() as unknown as SupabaseClient;

    const bucket1 = `contact:${await clientKey()}`;
    const bucket2 = `contact:email:${await sha256Hex(data.email.toLowerCase())}`;

    const result = await db.rpc("aviv_submit_contact", {
      _name: data.name,
      _email: data.email,
      _subject: data.subject,
      _message: data.message,
      _bucket1: bucket1,
      _bucket2: bucket2,
    });

    if (result.error) {
      console.error("[aviv-contact] rpc failed:", result.error.code, result.error.message);
      return unavailable;
    }

    const payload = result.data as { ok?: boolean; reason?: string } | null;

    if (!payload?.ok) {
      if (payload?.reason === "rate_limited") {
        return {
          sent: false,
          reason: "rate_limited",
          message: "You've sent several messages recently. Please wait an hour before trying again.",
        };
      }
      if (payload?.reason === "invalid") {
        return { sent: false, message: "Please check your details and try again." };
      }
      return unavailable;
    }

    return {
      sent: true,
      message:
        "Thank you. Your enquiry has been received by the AVIV team. Please allow time for a reply.",
    };
  });
