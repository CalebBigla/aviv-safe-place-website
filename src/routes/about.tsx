import { contentQuery } from "@/lib/aviv/queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, Values, CTA, EditorialContent } from "@/components/aviv-site";
import { cmsPageHead } from "@/lib/aviv/metadata";
import familyPhoto from "@/assets/aviv-connection-scene.jpg";
export const Route = createFileRoute("/about")({
  head: ({ match }) =>
    cmsPageHead(
      match.context.queryClient.getQueryData(contentQuery.queryKey),
      "About AVIV",
      "Meet the purpose behind AVIV Safe Place: emotional safety, family, hope and compassionate support.",
      "/about",
    ),
  component: About,
});
function About() {
  return (
    <>
      <PageHeading
        label="About AVIV Safe Place"
        title="A heart for healing. A place for hope."
        description="Heart Healed, Family Restored."
      />
      <section className="site-wrap section intro">
        <div>
          <div className="eyebrow">Our purpose</div>
          <h2 className="section-title">Compassion at the centre.</h2>
          <div className="care-image-frame editorial-photo family-photo">
            <img
              src={familyPhoto}
              alt="A mother and daughter sharing a warm conversation."
              width={1440}
              height={1024}
              loading="lazy"
            />
          </div>
        </div>
        <div>
          <p className="section-copy mb-6">
            AVIV Safe Place centres emotional safety, restoration, family, hope, and compassionate
            support.
          </p>
          <EditorialContent slug="about" />
        </div>
      </section>
      <section className="bg-muted">
        <div className="site-wrap section">
          <div className="eyebrow">The heart of AVIV</div>
          <h2 className="section-title">What we hold close.</h2>
          <Values />
        </div>
      </section>
      <CTA />
    </>
  );
}
