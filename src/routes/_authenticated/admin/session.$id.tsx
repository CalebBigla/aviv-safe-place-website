import { useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SessionRoom } from "@/components/aviv-session-room";
import { pageHead } from "@/lib/aviv/metadata";
import { getAdminSessionAccess } from "@/lib/aviv/session.functions";

export const Route = createFileRoute("/_authenticated/admin/session/$id")({
  head: () => pageHead("Video session", "Private AVIV video session.", "/admin/bookings", true),
  component: Session,
});

function Session() {
  const { id } = Route.useParams();
  const read = useServerFn(getAdminSessionAccess);
  const loadAccess = useCallback(() => read({ data: { id } }), [read, id]);
  return (
    <SessionRoom
      queryKey={["aviv-admin-session", id]}
      loadAccess={loadAccess}
      remoteLabel="Your client"
    />
  );
}
