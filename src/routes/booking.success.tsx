import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Unavailable } from "@/components/aviv-site";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/aviv/metadata";
import { checkGuestPayment } from "@/lib/aviv/payment.functions";
import {
  LAST_BOOKING_KEY,
  paymentReferenceSchema,
  type PaymentCheckResult,
} from "@/lib/aviv/payment-schema";

export const Route = createFileRoute("/booking/success")({
  // Paystack returns with ?reference=…&trxref=…
  validateSearch: (search: Record<string, unknown>) => ({
    reference: typeof search["reference"] === "string" ? search["reference"] : "",
  }),
  head: () => pageHead("Payment status", "Your AVIV Safe Place payment status.", "", true),
  component: Entry,
});

const outcomes: Record<
  Exclude<PaymentCheckResult["status"], "unknown">,
  { title: string; description: string }
> = {
  paid: {
    title: "Payment received. Thank you.",
    description:
      "AVIV will now confirm your appointment. When it's confirmed, your private video link will be emailed to you.",
  },
  late: {
    title: "Your payment arrived after your hold ended",
    description:
      "Your time was no longer available, so it couldn't be kept. AVIV has been notified and will contact you about another time or a refund.",
  },
  duplicate: {
    title: "This booking was already paid",
    description:
      "We've received more than one payment for this booking. AVIV will review the extra payment and contact you.",
  },
  review: {
    title: "Payment received",
    description: "AVIV needs to review this booking and will contact you.",
  },
  not_paid: {
    title: "Payment not completed",
    description:
      "No payment was taken. While your time is still held, you can try again from your booking link.",
  },
  rate_limited: {
    title: "Please try again shortly",
    description:
      "There have been too many checks from this connection. Please refresh in a few minutes.",
  },
  not_configured: {
    title: "Online payment isn't available",
    description: "Payment isn't set up yet. Please contact AVIV.",
  },
  infrastructure: {
    title: "We couldn't check your payment yet",
    description:
      "If you paid, it will be recorded automatically. Please check your booking link again shortly.",
  },
};

function Entry() {
  const { reference } = Route.useSearch();
  const check = useServerFn(checkGuestPayment);
  const valid = paymentReferenceSchema.safeParse({ reference }).success;
  const [bookingPath, setBookingPath] = useState("");
  useEffect(() => {
    try {
      setBookingPath(sessionStorage.getItem(LAST_BOOKING_KEY) ?? "");
    } catch {
      setBookingPath("");
    }
  }, []);
  const { data, isPending } = useQuery({
    queryKey: ["aviv-payment", reference],
    queryFn: () => check({ data: { reference } }),
    enabled: valid,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  if (valid && isPending)
    return (
      <section className="site-wrap section" role="status" aria-label="Checking your payment">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-24 mt-8 max-w-xl" />
      </section>
    );
  if (!valid || !data || data.status === "unknown")
    return (
      <Unavailable
        title="Payment status unavailable"
        description="We couldn't find this payment. If you paid, please check your booking link or contact AVIV."
      />
    );
  const outcome = outcomes[data.status];
  return (
    <section className="site-wrap section max-w-2xl">
      {data.status === "paid" && (
        <span className="held-check" aria-hidden="true">
          ✓
        </span>
      )}
      <div className="eyebrow">Payment</div>
      <h1 className="text-4xl mt-4 mb-4">{outcome.title}</h1>
      <p className="section-copy mb-8">{outcome.description}</p>
      {bookingPath.startsWith("/booking/manage/") ? (
        <Button asChild>
          <a href={bookingPath}>
            View your booking <ArrowUpRight />
          </a>
        </Button>
      ) : (
        <Button variant="outline" asChild>
          <Link to="/">Return to AVIV</Link>
        </Button>
      )}
    </section>
  );
}
