import { createFileRoute } from "@tanstack/react-router";
import { AdminView } from "@/components/aviv-admin";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/_authenticated/admin/media")({
  head: () => pageHead("Manage media", "AVIV image library and publication.", "/admin/media", true),
  component: () => <AdminView section="media" />,
});
