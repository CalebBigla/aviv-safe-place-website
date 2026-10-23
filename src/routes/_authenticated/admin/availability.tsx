import { createFileRoute } from "@tanstack/react-router";
import { AvailabilityAdmin } from "@/components/aviv-booking-admin";
import { pageHead } from "@/lib/aviv/metadata";

export const Route = createFileRoute("/_authenticated/admin/availability")({
  head: () =>
    pageHead("Availability", "AVIV weekly hours and closures.", "/admin/availability", true),
  component: AvailabilityAdmin,
});
