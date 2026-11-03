import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Unavailable } from "@/components/aviv-site";
import { SessionRoom } from "@/components/aviv-session-room";
import { guestTokenSchema } from "@/lib/aviv/guest-booking-schema";
import { pageHead } from "@/lib/aviv/metadata";
import { getGuestSessionAccess } from "@/lib/aviv/session.functions";

export const Route = createFileRoute("/session/$token")({
  head: () => pageHead("Your session", "Private AVIV video session.", "", true),
  component: Entry,
});

function Entry() {
  const { token } = Route.useParams();
  const read = useServerFn(getGuestSessionAccess);
  const loadAccess = useCallback(() => read({ data: { token } }), [read, token]);
  if (!guestTokenSchema.safeParse({ token }).success)
    return (
      <Unavailable
        title="Session link unavailable"
        description="This link is invalid, expired or no longer active."
      />
    );
  return (
    <SessionRoom
      queryKey={["aviv-guest-session", token]}
      loadAccess={loadAccess}
      remoteLabel="Your counsellor"
    />
  );
}
