import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/aviv-site";
import { GuestBookingForm } from '@/components/aviv-guest-booking';
import { cmsPageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/book")({
  loader:({context})=>context.queryClient.ensureQueryData(contentQuery),
  head: ({ match }) =>
    cmsPageHead(match.context.queryClient.getQueryData(contentQuery.queryKey), 
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
        <GuestBookingForm />
        <p className="section-copy mt-8 text-sm">
          Online booking and payment are not open yet. No appointment or payment will be created on
          this page.
        </p>
      </section>
    </>
  );
}
