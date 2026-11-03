import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { Unavailable } from "@/components/aviv-site";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/aviv/metadata";
import { formatNaira } from "@/lib/aviv/format";
import { formatLagosDateTime, formatLagosTime } from "@/lib/aviv/schedule";
import { readGuestBooking } from "@/lib/aviv/guest-booking.functions";
import { guestTokenSchema, type GuestBookingDetails } from "@/lib/aviv/guest-booking-schema";
import { issueGuestSessionLink } from "@/lib/aviv/session.functions";
import { sessionWindow } from "@/lib/aviv/session-schema";

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

const sessionLinkFailures = {
  early: "Your session room isn't open yet.",
  ended: "The room for this session has closed.",
  unavailable: "This session isn't available. Please refresh this page.",
  rate_limited: "There have been too many attempts. Please wait a few minutes and try again.",
  infrastructure: "We couldn't open your session right now. Please try again shortly.",
  not_configured: "Secure video sessions aren't connected yet. Please contact AVIV.",
};

// The button only reflects the room's hours; the server decides whether the guest may enter.
function SessionEntry({ token, start, end }: { token: string; start: string; end: string }) {
  const issue = useServerFn(issueGuestSessionLink);
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const { opensAt, closesAt } = sessionWindow(start, end);
  if (now >= closesAt.getTime()) return null;
  if (now < opensAt.getTime())
    return (
      <p className="mt-8 text-sm">
        Your private video room opens here at {formatLagosDateTime(opensAt.toISOString())} (Lagos
        time), 15 minutes before your session.
      </p>
    );
  return (
    <div className="mt-8">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailure("");
          try {
            const result = await issue({ data: { token } });
            if (result.status === "issued")
              await navigate({ to: "/session/$token", params: { token: result.token } });
            else setFailure(sessionLinkFailures[result.status]);
          } catch {
            setFailure(sessionLinkFailures.infrastructure);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Video />
        {busy ? "Opening…" : "Join your video session"}
      </Button>
      {failure && (
        <p role="alert" className="text-destructive text-sm mt-3">
          {failure}
        </p>
      )}
    </div>
  );
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
      {b.booking_status === "confirmed" && b.confirmed_start && b.confirmed_end && (
        <SessionEntry token={token} start={b.confirmed_start} end={b.confirmed_end} />
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        All times are in Lagos time (WAT, UTC+1). Keep this link private.
      </p>
    </section>
  );
}
