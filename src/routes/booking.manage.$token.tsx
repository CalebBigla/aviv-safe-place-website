import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Unavailable } from "@/components/aviv-site";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/aviv/metadata";
import { formatNaira } from "@/lib/aviv/format";
import { formatLagosDateTime, formatLagosTime } from "@/lib/aviv/schedule";
import { readGuestBooking } from "@/lib/aviv/guest-booking.functions";
import { guestTokenSchema, type GuestBookingDetails } from "@/lib/aviv/guest-booking-schema";

export const Route = createFileRoute("/booking/manage/$token")({
  head: () => pageHead("Your booking", "Secure guest booking status at AVIV Safe Place.", "", true),
  component: Entry,
});

// What the guest sees for each state, in plain language.
function describe(b: GuestBookingDetails): { title: string; detail: string } {
  if (b.booking_status === "expired")
    return {
      title: "This hold has ended",
      detail: "The time was released and no booking was made. You're welcome to choose a new time.",
    };
  if (b.booking_status === "pending" && b.payment_status !== "successful")
    return {
      title: `Held until ${b.hold_expires_at ? formatLagosTime(b.hold_expires_at) : "shortly"}`,
      detail:
        "Your time is held while payment is completed. Online payment is not available yet, so no payment has been taken; if payment isn't completed the hold ends and the time is released.",
    };
  if (b.booking_status === "pending")
    return {
      title: "Awaiting AVIV confirmation",
      detail: "Payment has been received. AVIV will confirm your appointment.",
    };
  if (b.booking_status === "confirmed")
    return { title: "Confirmed", detail: "Your appointment is confirmed." };
  if (b.booking_status === "reschedule_requested")
    return {
      title: "A new time is being arranged",
      detail: "AVIV would like to arrange a different time with you.",
    };
  if (b.booking_status === "cancelled")
    return { title: "Cancelled", detail: "This booking has been cancelled." };
  if (b.booking_status === "completed")
    return { title: "Completed", detail: "This session has taken place." };
  return { title: "Booking received", detail: "" };
}

function Entry() {
  const { token } = Route.useParams();
  const read = useServerFn(readGuestBooking);
  const valid = guestTokenSchema.safeParse({ token }).success;
  const { data, isPending } = useQuery({
    queryKey: ["aviv-guest-booking", token],
    queryFn: () => read({ data: { token } }),
    enabled: valid,
    retry: false,
    gcTime: 0,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  if (valid && isPending)
    return (
      <section className="site-wrap section" role="status" aria-label="Loading booking">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="h-32 mt-8" />
      </section>
    );
  if (data?.status === "rate_limited")
    return (
      <Unavailable
        title="Please try again shortly"
        description="There have been too many attempts to open booking links from this connection. Please wait a few minutes and refresh."
      />
    );
  if (data?.status === "infrastructure")
    return (
      <Unavailable
        title="Booking details are temporarily unavailable"
        description="We couldn't load this booking right now. Please try again shortly."
      />
    );
  if (data?.status !== "found")
    return (
      <Unavailable
        title="Booking link unavailable"
        description="This link is invalid, expired or no longer active. No private booking information is shown."
      />
    );
  const b = data.booking;
  const state = describe(b);
  const time = b.confirmed_start ?? b.requested_start;
  return (
    <section className="site-wrap section max-w-2xl">
      <div className="eyebrow">Your booking · No account needed</div>
      <h1 className="text-4xl mt-4 mb-3">{state.title}</h1>
      {state.detail && <p className="section-copy mb-8">{state.detail}</p>}
      <dl className="booking-summary">
        <dt>Session</dt>
        <dd>
          {b.service}
          {b.duration_minutes ? ` · ${b.duration_minutes} minutes` : ""}
        </dd>
        <dt>{b.confirmed_start ? "Appointment" : "Requested time"}</dt>
        <dd>{time ? `${formatLagosDateTime(time)} (Lagos time)` : "Not scheduled"}</dd>
        <dt>Fee</dt>
        <dd>{formatNaira(b.price_minor)}</dd>
        <dt>Reference</dt>
        <dd className="break-all">{b.reference}</dd>
      </dl>
      <p className="mt-6 text-sm text-muted-foreground">
        All times are in Lagos time (WAT, UTC+1). Keep this link private.
      </p>
    </section>
  );
}
