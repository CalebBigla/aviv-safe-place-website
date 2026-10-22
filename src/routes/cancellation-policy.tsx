import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, EditorialContent } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/cancellation-policy")({
  head: ({ match }) =>
    cmsPageHead(match.context.queryClient.getQueryData(contentQuery.queryKey), 
      "Cancellation & Refund Policy",
      "Cancellation and refund information for AVIV appointments.",
      "/cancellation-policy",
    ),
  component: Policy,
});
function Policy() {
  return (
    <>
      <PageHeading
        label="AVIV Safe Place"
        title="Cancellation & Refund Policy"
        description="Cancellation and refund information for AVIV appointments."
      />
      <section className="site-wrap section">
        <EditorialContent slug="cancellation-policy" />
      </section>
    </>
  );
}
