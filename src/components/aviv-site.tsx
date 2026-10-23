import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpRight, Menu, Heart, Sprout, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { contentQuery } from "@/lib/aviv/queries";
import { BrandMark } from "./aviv-experience";
import { formatNaira } from "@/lib/aviv/format";

export function Wordmark() {
  return (
    <Link to="/" aria-label="AVIV Safe Place home" className="wordmark">
      <BrandMark />
      <div>
        <div className="brand-name">AVIV</div>
        <div className="brand-sub">Safe Place</div>
      </div>
    </Link>
  );
}
const links = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
] as const;
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 bg-background p-3"
      >
        Skip to content
      </a>
      <header className="site-wrap site-header">
        <Wordmark />
        <nav aria-label="Main navigation" className="nav-links">
          {links.map((l) => (
            <Link key={l.to} to={l.to} activeOptions={{ exact: true }}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Button asChild className="hidden md:inline-flex h-11">
            <Link to="/book">
              Book a Session <ArrowUpRight />
            </Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>AVIV Safe Place</SheetTitle>
              <SheetDescription>Heart Healed, Family Restored.</SheetDescription>
              <nav className="flex flex-col gap-6 mt-10" aria-label="Mobile navigation">
                {links.map((l) => (
                  <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>
                    {l.label}
                  </Link>
                ))}
                <Button asChild>
                  <Link to="/book" onClick={() => setOpen(false)}>
                    Book a Session <ArrowUpRight />
                  </Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
export function Footer() {
  const { data } = useSuspenseQuery(contentQuery);
  return (
    <footer className="site-wrap footer">
      <div className="footer-main">
        <div>
          <Wordmark />
          <p className="mt-6 text-muted-foreground">
            {data.settings["footer_text"] || "Heart Healed, Family Restored."}
          </p>
        </div>
        <nav aria-label="Footer navigation" className="footer-links">
          <span className="eyebrow mb-2">Explore</span>
          {links.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
          <Link to="/book">Book a Session</Link>
        </nav>
        <div className="footer-links">
          <span className="eyebrow mb-2">Get in touch</span>
          <ContactDetails settings={data.settings} />
          <span className="text-muted-foreground text-xs leading-relaxed">
            If you are in immediate danger, contact local emergency services.
          </span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {data.settings["business_name"] || "AVIV Safe Place"}
        </span>
        <div className="flex flex-wrap gap-5">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cancellation-policy">Cancellation & Refunds</Link>
        </div>
      </div>
    </footer>
  );
}
export function ContactDetails({ settings }: { settings: Record<string, string> }) {
  const fields = [
    { key: "contact_email", label: "Email", kind: "email" },
    { key: "contact_phone", label: "Phone", kind: "phone" },
    { key: "contact_address", label: "Address", kind: "address" },
    { key: "social_instagram", label: "Instagram", kind: "social" },
    { key: "social_facebook", label: "Facebook", kind: "social" },
    { key: "social_linkedin", label: "LinkedIn", kind: "social" },
  ];
  return (
    <dl className="space-y-4 text-sm break-words">
      {fields.map(({ key, label, kind }) => {
        const value = settings[key];
        if (!value) return null;
        const placeholder =
          value.startsWith("[") || /@(?:[^@]*\.)?example\.(com|org|net)$/i.test(value);
        const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        const phoneValid = /^\+?[\d\s()-]{7,25}$/.test(value);
        let socialUrl: string | undefined;
        if (kind === "social" && !placeholder) {
          try {
            const url = new URL(value);
            if (url.protocol === "https:") socialUrl = url.href;
          } catch {
            /* Invalid settings stay plain text. */
          }
        }
        const href = placeholder
          ? undefined
          : kind === "email" && emailValid
            ? `mailto:${encodeURIComponent(value)}`
            : kind === "phone" && phoneValid
              ? `tel:${value.replace(/[\s()-]/g, "")}`
              : socialUrl;
        return (
          <div key={key}>
            <dt className="text-muted-foreground text-xs mb-1">
              {label}
              {placeholder ? " · Placeholder — not active" : ""}
            </dt>
            <dd>
              {href ? (
                <a
                  href={href}
                  target={socialUrl ? "_blank" : undefined}
                  rel={socialUrl ? "noopener noreferrer" : undefined}
                >
                  {kind === "social" ? label : value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
export function CTA() {
  const { data } = useSuspenseQuery(contentQuery);
  const content = data.pages.find((p) => p.slug === "home")?.content;
  const home = content && typeof content === "object" && !Array.isArray(content) ? content : {};
  return (
    <section className="cta-band">
      <div className="site-wrap cta-inner">
        <div>
          <h2>
            {(typeof home["cta_title"] === "string" && home["cta_title"]) ||
              "A gentle step towards a new beginning."}
          </h2>
          <p className="opacity-80">
            {(typeof home["cta_description"] === "string" && home["cta_description"]) ||
              "You don’t have to navigate it all alone."}
          </p>
        </div>
        <Button variant="hero" size="lg" className="h-12" asChild>
          <Link to="/book">
            Book a Session <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
export function PageHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="site-wrap page-heading">
      <div className="eyebrow">{label}</div>
      <h1>{title}</h1>
      <p className="section-copy">{description}</p>
    </div>
  );
}
// headingLevel follows the surrounding section: h3 under a section heading, h2 directly under the page h1.
export function ServicesList({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const { data } = useSuspenseQuery(contentQuery);
  if (!data.services.length)
    return (
      <div className="empty-state">
        <p className="text-lg text-foreground mb-2">Our session details will be available soon.</p>
        <p>Services, durations and fees will appear here once published.</p>
      </div>
    );
  return (
    <div className="service-list">
      {data.services.map((s, i) => (
        <article className="service-item" key={s.slug} id={s.slug}>
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <Heading>{s.title}</Heading>
          <p className="section-copy text-sm">{s.description}</p>
          {s.full_description && (
            <details className="mt-4">
              <summary>More about this service</summary>
              <p className="section-copy text-sm whitespace-pre-wrap mt-3">{s.full_description}</p>
            </details>
          )}
          {s.audience && <p className="mt-4 text-sm">For {s.audience}</p>}
          <div className="flex flex-wrap gap-4 my-5 text-sm">
            {s.duration_minutes && <span>{s.duration_minutes} minutes</span>}
            {s.price_minor !== null && <span>{formatNaira(s.price_minor)}</span>}
            {s.delivery_format && <span>{s.delivery_format}</span>}
          </div>
          <Button asChild variant="outline">
            <Link to="/book">
              Book a Session <ArrowUpRight />
            </Link>
          </Button>
        </article>
      ))}
    </div>
  );
}
export function FAQs() {
  const { data } = useSuspenseQuery(contentQuery);
  return (
    <div className="faq-list">
      {data.faqs.length ? (
        data.faqs.map((f) => (
          <details key={f.id}>
            <summary>{f.question}</summary>
            <p className="section-copy mt-4">{f.answer}</p>
          </details>
        ))
      ) : (
        <p className="empty-state">Answers to common questions will appear here once published.</p>
      )}
    </div>
  );
}
export function Values() {
  return (
    <div className="values">
      {[
        {
          Icon: Heart,
          title: "Emotional safety",
          text: "Space for your feelings. Room for your story.",
        },
        {
          Icon: Users,
          title: "Family & connection",
          text: "Holding care for the relationships that matter.",
        },
        {
          Icon: Sprout,
          title: "Hope & restoration",
          text: "A compassionate outlook, one step at a time.",
        },
      ].map((v) => (
        <div key={v.title}>
          <v.Icon size={30} strokeWidth={1.2} />
          <h3>{v.title}</h3>
          <p>{v.text}</p>
        </div>
      ))}
    </div>
  );
}
export function EditorialContent({ slug }: { slug: string }) {
  const { data } = useSuspenseQuery(contentQuery);
  const page = data.pages.find((p) => p.slug === slug);
  return page ? (
    <div
      className={
        ["privacy", "terms", "cancellation-policy"].includes(slug) ? "policy-content" : "prose-text"
      }
    >
      {["privacy", "terms", "cancellation-policy"].includes(slug)
        ? page.body.split(/\n\s*\n/).map((block, index) =>
            /^\d+[.)]\s/.test(block.trim()) && !block.includes("\n") ? (
              <h2 key={index} id={`policy-section-${index}`}>
                {block}
              </h2>
            ) : (
              <p key={index}>{block}</p>
            ),
          )
        : page.body}
    </div>
  ) : (
    <p className="section-copy">Further information will be shared once approved and published.</p>
  );
}
export function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeading label="AVIV Safe Place" title={title} description={description} />
      <div className="site-wrap section">
        <Button asChild>
          <Link to="/contact">
            Contact AVIV <ArrowUpRight />
          </Link>
        </Button>
      </div>
    </>
  );
}
