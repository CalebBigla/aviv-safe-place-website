import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { GuestBookingForm } from "@/components/aviv-guest-booking";
import { cmsPageHead } from "@/lib/aviv/metadata";

export const Route = createFileRoute("/book")({
  loader: ({ context }) => context.queryClient.ensureQueryData(contentQuery),
  head: ({ match }) =>
    cmsPageHead(
      match.context.queryClient.getQueryData(contentQuery.queryKey),
      "Book a Session",
      "Explore guest booking at AVIV Safe Place. No client account needed; appointments require AVIV confirmation.",
      "/book",
    ),
  component: Book,
});

function Book() {
  return (
    <div className="site-wrap booking-page">
      {/* Intro — small, above the fold */}
      <div className="booking-page-intro animate-fade-up">
        <div className="eyebrow">Your gentle beginning</div>
        <h1 className="booking-page-title">Make space for yourself.</h1>
        <p className="text-sm text-muted-foreground mt-3" style={{ maxWidth: 520 }}>
          No account needed. Sessions are Mon & Wed 10 AM – 1 PM and Sat 10 AM – 3 PM (Lagos time).
          AVIV confirms every appointment.
        </p>
      </div>

      {/* Booking form is the primary content — shown immediately */}
      <GuestBookingForm />
    </div>
  );
}
