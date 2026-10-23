import { createFileRoute } from "@tanstack/react-router";
import { AdminView } from "@/components/aviv-admin";
import { pageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/_authenticated/admin/services")({
  head: () =>
    pageHead(
      "Manage services",
      "Edit AVIV services, prices and publication.",
      "/admin/services",
      true,
    ),
  component: () => <AdminView section="services" />,
});
