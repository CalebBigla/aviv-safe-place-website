import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Heart, Users, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
const logo = "/favicon.png";
import family from "@/assets/family-counselling-circle.webp";
import room from "@/assets/aviv-sanctuary.jpg";
import welcome from "@/assets/aviv-welcome-scene.jpg";

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

// What rises gently into view as a visitor scrolls. Items in a row are staggered.
const revealTargets = [
  ".section-title:not(.section-head *):not(.care-image-split *)",
  ".section-head",
  ".care-image-split > div",
  ".editorial-photo:not(.care-image-split *):not(.support-image *)",
  ".support-tabs",
  ".support-panel",
  ".service-item",
  ".values > div",
  ".steps > div",
  ".faq-list",
  ".cta-inner",
  ".contact-grid form",
]
  .map((selector) => `#main-content ${selector}`)
  .join(",");
const REVEAL_LINE = 0.94;
const STAGGER_MS = 70;
const MAX_STAGGER_STEPS = 5;
const REVEAL_MS = 750;
const hiddenFrame = { opacity: 0, transform: "translateY(22px)" };

export function PageMotion({ path }: { path: string }) {
  useEffect(() => {
    if (
      path.startsWith("/admin") ||
      path.startsWith("/session") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const seen = new WeakSet<Element>();
    // Web Animations leave class and style attributes alone. This effect can run before React has
    // hydrated the page content, and changing those attributes would cause a hydration mismatch.
    const pending = new Map<HTMLElement, { hold: Animation; delay: number }>();
    const release = (element: HTMLElement, animate: boolean) => {
      const entry = pending.get(element);
      if (!entry) return;
      pending.delete(element);
      entry.hold.cancel();
      if (animate)
        element.animate([hiddenFrame, { opacity: 1, transform: "none" }], {
          duration: REVEAL_MS,
          delay: entry.delay,
          easing: "cubic-bezier(.22, 1, .36, 1)",
          fill: "backwards",
        });
    };
    // Only content below the fold is ever hidden, and positions are rechecked on every scroll,
    // so a fast scroll, an anchor jump or the End key can't leave anything invisible.
    const reveal = () => {
      const line = window.innerHeight * REVEAL_LINE;
      pending.forEach((_, element) => {
        if (element.getBoundingClientRect().top < line) release(element, true);
      });
    };
    const scan = () => {
      document.querySelectorAll<HTMLElement>(revealTargets).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        if (element.getBoundingClientRect().top < window.innerHeight * REVEAL_LINE) return;
        const position = element.parentElement
          ? [...element.parentElement.children].indexOf(element)
          : 0;
        pending.set(element, {
          hold: element.animate([hiddenFrame, hiddenFrame], { duration: 1, fill: "forwards" }),
          delay: Math.min(position, MAX_STAGGER_STEPS) * STAGGER_MS,
        });
      });
      reveal();
    };
    let frame = 0;
    let scanNeeded = false;
    const tick = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (scanNeeded) scan();
        else reveal();
        scanNeeded = false;
        driftHero();
      });
    };
    // Keyboard users must never land on something hidden.
    const onFocus = (event: FocusEvent) =>
      pending.forEach((_, element) => {
        if (element.contains(event.target as Node)) release(element, false);
      });
    const onPrint = () => pending.forEach((_, element) => release(element, false));
    // Route content can arrive after the path changes, so new elements are picked up as they mount.
    const mutations = new MutationObserver(() => {
      scanNeeded = true;
      tick();
    });
    const content = document.getElementById("main-content");
    if (content) mutations.observe(content, { childList: true, subtree: true });
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick, { passive: true });
    window.addEventListener("beforeprint", onPrint);
    document.addEventListener("focusin", onFocus);
    scan();
    driftHero();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      window.removeEventListener("beforeprint", onPrint);
      document.removeEventListener("focusin", onFocus);
      pending.forEach((_, element) => release(element, false));
    };
  }, [path]);
  return null;
}

// The hero photo drifts slightly slower than the page. Respects the hero's pause control.
// The value lives on <html>, which hydrates first, so it can't cause a hydration mismatch.
const HERO_DRIFT_RATE = 0.1;
const HERO_DRIFT_LIMIT = 28;
function driftHero() {
  const hero = document.querySelector<HTMLElement>(".welcome-scene");
  if (!hero || hero.dataset["paused"] === "true") return;
  const shift = Math.min(Math.max(window.scrollY, 0) * HERO_DRIFT_RATE, HERO_DRIFT_LIMIT);
  document.documentElement.style.setProperty("--hero-drift", `${shift.toFixed(1)}px`);
}

export function useScrolled(threshold = 12) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

export function scrollToSection(id: string) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}

const paths = [
  {
    title: "For your heart",
    Icon: Heart,
    heading: "Room for your story.",
    body: "A compassionate space to be heard, reflect and take your next step at your own pace.",
    image: room,
    width: 1920,
    height: 1088,
    alt: "A welcoming counselling room with comfortable chairs and sunlight.",
  },
  {
    title: "For your family",
    Icon: Users,
    heading: "Connection begins with care.",
    body: "Make space for the relationships that matter, with understanding, communication and hope.",
    image: family,
    width: 1280,
    height: 853,
    alt: "A counsellor talking warmly with a family seated around her.",
  },
  {
    title: "For your next chapter",
    Icon: Sprout,
    heading: "A gentle beginning, together.",
    body: "Restoration is a journey. Start with a conversation about the support you are looking for.",
    image: welcome,
    width: 1920,
    height: 1088,
    alt: "A sunlit room with comfortable chairs overlooking a garden.",
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
              width={current.width}
              height={current.height}
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
