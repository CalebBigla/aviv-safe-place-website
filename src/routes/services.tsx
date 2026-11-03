import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, ServicesList, FAQs, CTA } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
import familyCirclePhoto from "@/assets/family-counselling-circle.webp";
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
      <section className="site-wrap section">
        <div className="care-image-split">
          <div className="care-image-frame">
            <img
              src={familyCirclePhoto}
              alt="A counsellor talking warmly with a family seated around her."
              width={1280}
              height={853}
              loading="lazy"
            />
          </div>
          <div>
            <div className="eyebrow">How we can help</div>
            <h2 className="section-title">Choose what fits where you are today.</h2>
            <p className="section-copy">
              Every session is a private space to talk and be heard. Take your time, and book when
              you feel ready.
            </p>
          </div>
        </div>
        <div className="services-directory">
          <ServicesList />
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
