import { createFileRoute } from "@tanstack/react-router";
import { BookingDetail } from "@/components/aviv-booking-admin";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/_authenticated/admin/bookings/$id")({
  head: () => pageHead("Booking details", "Private AVIV booking details.", "/admin/bookings", true),
  component: Booking,
});
function Booking() {
  const { id } = Route.useParams();
  return <BookingDetail id={id} />;
}
