import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, EditorialContent } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/terms")({
  head: ({ match }) =>
    cmsPageHead(
      match.context.queryClient.getQueryData(contentQuery.queryKey),
      "Terms",
      "Terms for using AVIV Safe Place.",
      "/terms",
    ),
  component: Policy,
});
function Policy() {
  return (
    <>
      <PageHeading
        label="AVIV Safe Place"
        title="Terms"
        description="Terms for using AVIV Safe Place."
      />
      <section className="site-wrap section">
        <EditorialContent slug="terms" />
      </section>
    </>
  );
}
