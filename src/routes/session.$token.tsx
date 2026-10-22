import { createFileRoute } from "@tanstack/react-router";
import { Unavailable } from "@/components/aviv-site";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/session/$token")({
  head: () =>
    pageHead(
      "Session access unavailable",
      "Secure video session entry is not available yet. No video room has been created.",
      "",
      true,
    ),
  component: Entry,
});
function Entry() {
  return (
    <Unavailable
      title="Session access unavailable"
      description="Secure video session entry is not available yet. No video room has been created."
    />
  );
}
