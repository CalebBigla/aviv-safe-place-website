import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import type { z } from "zod";
import { PageHeading, ContactDetails } from "@/components/aviv-site";
import { Button } from "@/components/ui/button";
import { cmsPageHead } from "@/lib/aviv/metadata";
import { contactSchema } from "@/lib/aviv/contact-schema";
import { submitContact } from "@/lib/aviv/contact.functions";
import { contentQuery } from "@/lib/aviv/queries";
import carePhoto from "@/assets/aviv-sanctuary.jpg";
export const Route = createFileRoute("/contact")({
  head: ({ match }) =>
    cmsPageHead(
      match.context.queryClient.getQueryData(contentQuery.queryKey),
      "Contact",
      "Get in touch with AVIV Safe Place for general enquiries and booking information.",
      "/contact",
    ),
  component: Contact,
});
function Contact() {
  const { data } = useSuspenseQuery(contentQuery);
  const submit = useServerFn(submitContact);
  const [notice, setNotice] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { website: "" },
  });
  return (
    <>
      <PageHeading
        label="Get in touch"
        title="We’re glad you’re here."
        description="For a general enquiry or a question about taking the first step, make space for a conversation."
      />
      <section className="site-wrap section contact-grid">
        <div>
          <h2 className="section-title mt-0">Let’s connect.</h2>
          <img
            className="editorial-photo care-photo"
            src={carePhoto}
            alt="A welcoming counselling room with comfortable chairs and sunlight."
            width={645}
            height={645}
            loading="lazy"
          />
          <ContactDetails settings={data.settings} />
          <div className="border-t mt-8 pt-8">
            <h3 className="text-xl">Looking for a session?</h3>
            <Button className="mt-5" asChild>
              <Link to="/book">
                Book a Session <ArrowUpRight />
              </Link>
            </Button>
          </div>
          <p className="section-copy text-sm mt-8">
            Please keep enquiries general. Do not include sensitive counselling details. This form
            is not an emergency service.
          </p>
        </div>
        <form
          method="post"
          onSubmit={handleSubmit(async (values) => {
            setNotice("");
            try {
              const result = await submit({ data: values });
              setNotice(result.message);
            } catch {
              setNotice("Your message could not be sent. Please try again later.");
            }
          })}
          noValidate
        >
          <div className="form-grid">
            {(
              [
                { key: "name", label: "Your name", type: "text" },
                { key: "email", label: "Email address", type: "email" },
                { key: "subject", label: "Subject", type: "text" },
              ] as const
            ).map((f) => (
              <div
                className={`form-field ${f.key === "subject" ? "form-field-wide" : ""}`}
                key={f.key}
              >
                <label htmlFor={f.key}>{f.label}</label>
                <input
                  id={f.key}
                  type={f.type}
                  maxLength={f.key === "name" ? 100 : f.key === "email" ? 255 : 150}
                  autoComplete={f.key === "name" ? "name" : f.key === "email" ? "email" : "off"}
                  aria-invalid={!!errors[f.key]}
                  aria-describedby={errors[f.key] ? `${f.key}-error` : undefined}
                  {...register(f.key)}
                />
                {errors[f.key] && (
                  <span id={`${f.key}-error`} className="field-error">
                    {errors[f.key]?.message}
                  </span>
                )}
              </div>
            ))}
            <div className="form-field form-field-wide">
              <label htmlFor="message">Your message</label>
              <textarea
                id="message"
                rows={6}
                maxLength={2000}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? "message-error" : undefined}
                {...register("message")}
              />
              {errors.message && (
                <span id="message-error" className="field-error">
                  {errors.message.message}
                </span>
              )}
            </div>
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-5">
            General enquiries are stored securely for the AVIV team. Please do not include sensitive
            counselling details. Email notifications are not enabled yet.
          </p>
          <Button type="submit" disabled={isSubmitting} className="mt-6 h-12">
            {isSubmitting ? "Submitting…" : "Send enquiry"} <ArrowUpRight />
          </Button>
          {notice && (
            <p role="status" className="mt-5 text-sm leading-relaxed text-muted-foreground">
              {notice}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
