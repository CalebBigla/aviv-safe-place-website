import { createFileRoute } from "@tanstack/react-router";
import { Unavailable } from "@/components/aviv-site";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/booking/success")({
  head: () =>
    pageHead(
      "Booking status",
      "Booking and payment verification are not available yet. Returning to this page does not confirm a payment or an appointment.",
      "",
      true,
    ),
  component: Entry,
});
function Entry() {
  return (
    <Unavailable
      title="Booking status"
      description="Booking and payment verification are not available yet. Returning to this page does not confirm a payment or an appointment."
    />
  );
}
