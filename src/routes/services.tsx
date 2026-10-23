import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, ServicesList, FAQs, CTA } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
import listeningPhoto from "@/assets/aviv-connection-scene.jpg";
export const Route = createFileRoute("/services")({
  head: ({ match }) =>
    cmsPageHead(
      match.context.queryClient.getQueryData(contentQuery.queryKey),
      "Our services",
      "Explore published AVIV counselling services, session formats, durations and fees.",
      "/services",
    ),
  component: Services,
});
function Services() {
  return (
    <>
      <PageHeading
        label="Care, considered"
        title="Support for your next chapter."
        description="A place to begin, wherever you are in your story."
      />
      <section className="site-wrap section services-with-photo">
        <img
          className="editorial-photo listening-photo"
          src={listeningPhoto}
          alt="Two people having a thoughtful counselling conversation"
          width={600}
          height={900}
          loading="lazy"
        />
        <div className="services-directory">
          <ServicesList headingLevel="h2" />
        </div>
      </section>
      <section id="faqs" className="site-wrap section pt-0">
        <div className="eyebrow">Your questions</div>
        <h2 className="section-title">A little clarity before you begin.</h2>
        <FAQs />
      </section>
      <CTA />
    </>
  );
}
