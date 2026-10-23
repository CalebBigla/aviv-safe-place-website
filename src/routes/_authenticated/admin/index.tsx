import { createFileRoute } from "@tanstack/react-router";
import { AdminView } from "@/components/aviv-admin";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => pageHead("Administration", "AVIV administrator overview.", "/admin", true),
  component: () => <AdminView section="overview" />,
});
