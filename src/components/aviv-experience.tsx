import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Heart, Users, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
const logo = "/favicon.png";
import connection from "@/assets/aviv-connection-scene.jpg";
import conversation from "@/assets/aviv-connection-scene.jpg";
import family from "@/assets/aviv-connection-scene.jpg";

export function BrandMark({
  variant = "teal",
  className = "",
}: {
  variant?: "teal" | "ivory" | "blush";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`aviv-logo logo-${variant} ${className}`}
      style={{ maskImage: `url(${logo})`, WebkitMaskImage: `url(${logo})` }}
    />
  );
}

export function PageMotion({ path }: { path: string }) {
  useEffect(() => {
    if (path.startsWith("/admin") || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    const elements = document.querySelectorAll("#main-content .section, #main-content .cta-band");
    elements.forEach((element) => {
      element.classList.add("reveal-ready");
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove("reveal-ready", "reveal-visible"));
    };
  }, [path]);
  return null;
}

const paths = [
  {
    title: "For your heart",
    Icon: Heart,
    heading: "Room for your story.",
    body: "A compassionate space to be heard, reflect and take your next step at your own pace.",
    image: conversation,
    alt: "A thoughtful counselling conversation",
  },
  {
    title: "For your family",
    Icon: Users,
    heading: "Connection begins with care.",
    body: "Make space for the relationships that matter, with understanding, communication and hope.",
    image: family,
    alt: "A family sharing a joyful moment",
  },
  {
    title: "For your next chapter",
    Icon: Sprout,
    heading: "A gentle beginning, together.",
    body: "Restoration is a journey. Start with a conversation about the support you are looking for.",
    image: connection,
    alt: "Illustrative mother and daughter sharing a warm conversation",
  },
] as const;

export function SupportExplorer() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = paths[selected] ?? paths[0];
  return (
    <section className="support-explorer bg-accent">
      <div className="site-wrap section">
        <div className="eyebrow">A little space for you</div>
        <h2 className="section-title">What brings you here?</h2>
        <div className="support-tabs" role="tablist" aria-label="Explore support">
          {paths.map((item, index) => (
            <Button
              key={item.title}
              variant="ghost"
              role="tab"
              id={`support-tab-${index}`}
              aria-selected={selected === index}
              aria-controls="support-panel"
              tabIndex={selected === index ? 0 : -1}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % paths.length;
                else if (event.key === "ArrowLeft")
                  next = (index + paths.length - 1) % paths.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = paths.length - 1;
                else return;
                event.preventDefault();
                setSelected(next);
                tabs.current[next]?.focus();
              }}
            >
              <item.Icon size={19} strokeWidth={1.4} />
              {item.title}
            </Button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="support-panel"
          aria-labelledby={`support-tab-${selected}`}
          tabIndex={0}
          className="support-panel"
        >
          <div className="support-image">
            <img
              key={current.image}
              src={current.image}
              alt={current.alt}
              width={1440}
              height={1024}
              loading="lazy"
            />
          </div>
          <div className="support-copy" key={selected}>
            <BrandMark variant="teal" />
            <h3>{current.heading}</h3>
            <p className="section-copy">{current.body}</p>
            <Button variant="link" className="px-0 mt-5" asChild>
              <Link to="/services">
                Explore our services <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
