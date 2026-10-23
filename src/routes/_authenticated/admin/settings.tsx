import { createFileRoute } from "@tanstack/react-router";
import { AdminView } from "@/components/aviv-admin";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () =>
    pageHead(
      "Manage settings",
      "AVIV contact details and administrator preferences.",
      "/admin/settings",
      true,
    ),
  component: () => <AdminView section="settings" />,
});
