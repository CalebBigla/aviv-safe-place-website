import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/aviv-site";
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
    <>
      <PageHeading
        label="Your gentle beginning"
        title="Make space for yourself."
        description="Explore our published sessions. You won’t need to create an account, and your appointment will be confirmed by AVIV."
      />
      <section className="site-wrap section">
        <div className="eyebrow">Choose your support</div>
        <h2 className="section-title">Find your starting point.</h2>
        <p className="section-copy mb-8 text-sm">
          Sessions are offered on Mondays and Wednesdays from 10:00 AM to 1:00 PM, and Saturdays
          from 10:00 AM to 3:00 PM (Lagos time). Choose a time and we'll hold it for you while
          payment is completed. Online payment is not available yet, so no payment will be taken.
        </p>
        <GuestBookingForm />
      </section>
    </>
  );
}
