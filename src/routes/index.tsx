import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowDown, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CTA, ServicesList, FAQs, Values } from "@/components/aviv-site";
import { cmsPageHead, siteOrigin } from "@/lib/aviv/metadata";
import sanctuary from "@/assets/aviv-welcome-scene.jpg";
import { BrandMark, SupportExplorer } from "@/components/aviv-experience";
import { useState } from "react";
import conversationPhoto from "@/assets/aviv-connection-scene.jpg";
import { useSuspenseQuery } from "@tanstack/react-query";
import { contentQuery } from "@/lib/aviv/queries";
export const Route = createFileRoute("/")({
  head: ({ match }) => {
    const data = match.context.queryClient.getQueryData(contentQuery.queryKey);
    const head = cmsPageHead(
      data,
      "Compassionate counselling",
      "AVIV Safe Place. Heart Healed, Family Restored. A compassionate space for emotional safety, hope and connection.",
      "/",
    );
    if (!siteOrigin) return head;
    // Only facts the site already publishes; "<" is escaped so CMS text cannot close the script.
    const organisation = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: data?.settings["business_name"] || "AVIV Safe Place",
      slogan: "Heart Healed, Family Restored.",
      url: siteOrigin,
      logo: `${siteOrigin}/favicon.png`,
    };
    return {
      ...head,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(organisation).replace(/</g, "\\u003c"),
        },
      ],
    };
  },
  component: Index,
});
function Index() {
  const [paused, setPaused] = useState(false);
  const { data } = useSuspenseQuery(contentQuery);
  const raw = data.pages.find((p) => p.slug === "home")?.content;
  const home = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const copy = (key: string, fallback: string) =>
    (typeof home[key] === "string" && home[key]) || fallback;
  const cover = data.media.find((m) => m.id === home["hero_media_id"]);
  return (
    <>
      <section className="hero welcome-scene" data-paused={paused}>
        <img
          className="hero-photo"
          src={cover?.url || sanctuary}
          alt={
            cover?.alt_text ||
            "Illustrative sunlit room with comfortable chairs overlooking a garden"
          }
          width={1920}
          height={1088}
          fetchPriority="high"
        />
        <div className="site-wrap hero-inner">
          <BrandMark variant="ivory" className="scene-mark" />
          <div className="eyebrow">
            {copy("hero_eyebrow", "A space for care. A place for you.")}
          </div>
          <h1>
            AVIV <span>Safe Place.</span>
          </h1>
          <div className="scene-tagline">Heart Healed, Family Restored.</div>
          <p>
            {copy(
              "hero_description",
              "AVIV Safe Place — compassionate support for your heart, your relationships, and your next chapter.",
            )}
          </p>
          <div className="hero-actions">
            <Button variant="hero" size="lg" className="h-12" asChild>
              <Link to="/book">
                Book a Session <ArrowUpRight />
              </Link>
            </Button>
            <Button variant="heroOutline" size="lg" className="h-12" asChild>
              <Link to="/services">
                Explore our services <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
        <div className="site-wrap hero-bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label={paused ? "Play entrance motion" : "Pause entrance motion"}
            title={paused ? "Play entrance motion" : "Pause entrance motion"}
            onClick={() => setPaused(!paused)}
            className="scene-motion-control"
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </Button>
          <a href="#welcome" className="flex gap-3 items-center">
            A gentle beginning <ArrowDown size={14} />
          </a>
        </div>
      </section>
      <section id="welcome" className="site-wrap section intro">
        <div>
          <div className="eyebrow">Welcome to AVIV Safe Place</div>
          <h2 className="section-title whitespace-pre-line">
            {copy("intro_title", "Your story matters.\nSo do you.")}
          </h2>
          <img
            className="editorial-photo welcome-photo"
            src={conversationPhoto}
            alt="A mother and daughter sharing a warm conversation."
            width={626}
            height={417}
            loading="lazy"
          />
        </div>
        <div>
          <p className="section-copy">
            {copy(
              "intro_body",
              "At the heart of AVIV Safe Place is a simple intention: emotional safety, compassionate support, and hope for restoration.",
            )}
          </p>
          <p className="section-copy mt-5">
            {copy(
              "intro_supporting",
              "For the heart. For the family. For the connections that make us who we are.",
            )}
          </p>
          <Button variant="link" asChild className="px-0 mt-5">
            <Link to="/about">
              Get to know AVIV <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </section>
      <SupportExplorer />
      <section className="bg-muted">
        <div className="site-wrap section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Support, with care</div>
              <h2 className="section-title mb-0">Space for what you’re carrying.</h2>
            </div>
            <Button variant="link" asChild>
              <Link to="/services">
                View all services <ArrowUpRight />
              </Link>
            </Button>
          </div>
          <ServicesList />
        </div>
      </section>
      <section className="site-wrap section">
        <div className="eyebrow">What guides us</div>
        <h2 className="section-title">
          {copy("values_title", "Care that begins with compassion.")}
        </h2>
        <Values />
      </section>
      <section className="bg-muted">
        <div className="site-wrap section">
          <div className="eyebrow">A gentle beginning</div>
          <h2 className="section-title">{copy("approach_title", "One step at a time.")}</h2>
          <p className="section-copy mb-10">
            {copy(
              "approach_description",
              "Our planned booking experience keeps care personal. No client account needed; appointments are confirmed by AVIV.",
            )}
          </p>
          <div className="steps">
            {[
              {
                title: "Choose your support",
                text: "Explore the published services and find the support you’d like to request.",
              },
              {
                title: "Share your details",
                text: "Provide the essential contact details needed for your booking.",
              },
              {
                title: "Payment & confirmation",
                text: "Payment will be verified securely. AVIV then confirms your appointment.",
              },
              {
                title: "Make space for you",
                text: "Once confirmed, receive your appointment details and secure session access.",
              },
            ].map((s, i) => (
              <div key={s.title}>
                <div className="step-number">0{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="site-wrap section">
        <div className="section-head">
          <div>
            <div className="eyebrow">A little clarity</div>
            <h2 className="section-title mb-0">Questions on your mind?</h2>
          </div>
          <Button variant="link" asChild>
            <Link to="/services" hash="faqs">
              All questions <ArrowUpRight />
            </Link>
          </Button>
        </div>
        <FAQs />
      </section>
      <CTA />
    </>
  );
}
