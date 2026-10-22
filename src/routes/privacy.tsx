import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, EditorialContent } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
export const Route = createFileRoute("/privacy")({
  head: ({ match }) => cmsPageHead(match.context.queryClient.getQueryData(contentQuery.queryKey), "Privacy Policy", "How AVIV handles your information.", "/privacy"),
  component: Policy,
});
function Policy() {
  return (
    <>
      <PageHeading
        label="AVIV Safe Place"
        title="Privacy Policy"
        description="How AVIV handles your information."
      />
      <section className="site-wrap section">
        <EditorialContent slug="privacy" />
      </section>
    </>
  );
}
