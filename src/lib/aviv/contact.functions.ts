import { createServerFn } from "@tanstack/react-start";
import { contactSchema } from "./contact-schema";
export const submitContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => contactSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.website) return { sent: false, message: "Your message could not be sent." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data.email.toLowerCase()),
    );
    const bucket =
      "contact:" +
      Array.from(new Uint8Array(digest))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
    const limit = await supabaseAdmin.rpc("consume_contact_limit", { bucket });
    if (limit.error || !limit.data)
      return { sent: false, message: "Please wait before trying again." };
    const result=await supabaseAdmin.from('contact_submissions').insert({name:data.name,email:data.email,subject:data.subject,message:data.message});
    if(result.error)return {sent:false,message:'Your enquiry could not be saved. Please try again later.'};
    return {
      sent: true,
      message:
        "Your general enquiry has been received for the AVIV team. Email notifications are not enabled yet.",
    };
  });
