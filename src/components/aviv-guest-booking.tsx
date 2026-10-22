import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { contentQuery } from "@/lib/aviv/queries";
import type { getPublicContent } from "@/lib/aviv/content.functions";
import { guestBookingSchema, type GuestBookingResult } from "@/lib/aviv/guest-booking-schema";
import { getGuestAvailability, submitGuestBooking } from "@/lib/aviv/guest-booking.functions";
import { formatNaira } from "@/lib/aviv/format";
import {
  BOOKING_HORIZON_DAYS,
  addDays,
  formatLagosDate,
  formatLagosDateTime,
  formatLagosTime,
  isSessionDuration,
  lagosDateKey,
  openDaysFrom,
} from "@/lib/aviv/schedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

type Service = Awaited<ReturnType<typeof getPublicContent>>["services"][number];
type Step = "session" | "time" | "details" | "review";
type Details = { name: string; email: string; phone: string; policyAccepted: boolean };
type Held = Extract<GuestBookingResult, { created: true }>;

const steps: { key: Step; label: string }[] = [
  { key: "session", label: "Session" },
  { key: "time", label: "Date & time" },
  { key: "details", label: "Your details" },
  { key: "review", label: "Review" },
];
const WINDOW_DAYS = 14;

export function GuestBookingForm() {
  const { data } = useSuspenseQuery(contentQuery);
  const services = data.services.filter((s) => isSessionDuration(s.duration_minutes));
  const [step, setStep] = useState<Step>("session");
  const [slug, setSlug] = useState("");
  const [start, setStart] = useState("");
  const [details, setDetails] = useState<Details>({
    name: "",
    email: "",
    phone: "",
    policyAccepted: false,
  });
  const [held, setHeld] = useState<Held | null>(null);
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const service = services.find((s) => s.slug === slug);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step, held]);

  if (!services.length)
    return (
      <p className="empty-state">
        Session options are being prepared. No services are available to book yet.
      </p>
    );
  if (held && service)
    return <HeldConfirmation held={held} service={service} headingRef={heading} />;

  const go = (next: Step) => {
    setNotice("");
    setStep(next);
  };
  const index = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl">
      <ol aria-label="Booking progress" className="flex flex-wrap gap-6 text-sm border-y py-5 mb-8">
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === index ? "step" : undefined}
            className={i === index ? "font-semibold" : "text-muted-foreground"}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>
      <h3 ref={heading} tabIndex={-1} className="text-2xl mb-6 outline-none">
        {steps[index]?.label}
      </h3>
      {step === "session" && (
        <SessionStep
          services={services}
          slug={slug}
          onChange={(next) => {
            setSlug(next);
            setStart("");
          }}
          onContinue={() => go("time")}
        />
      )}
      {step === "time" && service && (
        <TimeStep
          service={service}
          start={start}
          notice={notice}
          onSelect={setStart}
          onBack={() => go("session")}
          onContinue={() => go("details")}
        />
      )}
      {step === "details" && (
        <DetailsStep
          details={details}
          onChange={setDetails}
          onBack={() => go("time")}
          onContinue={() => go("review")}
        />
      )}
      {step === "review" && service && (
        <ReviewStep
          service={service}
          start={start}
          details={details}
          onBack={() => go("details")}
          onHeld={setHeld}
          onSlotLost={(message) => {
            setStart("");
            setStep("time");
            setNotice(message);
          }}
        />
      )}
    </div>
  );
}

function StepActions({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 mt-8">
      {onBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      )}
      {children}
    </div>
  );
}

function SessionStep({
  services,
  slug,
  onChange,
  onContinue,
}: {
  services: Service[];
  slug: string;
  onChange: (slug: string) => void;
  onContinue: () => void;
}) {
  const service = services.find((s) => s.slug === slug);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (service) onContinue();
      }}
    >
      <label htmlFor="booking-service" className="block space-y-2">
        <span>Choose a session</span>
        <select
          id="booking-service"
          className="admin-select w-full"
          required
          value={slug}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select a session</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.title} · {s.duration_minutes} minutes
            </option>
          ))}
        </select>
      </label>
      {service && (
        <section className="border-y py-6 mt-6 space-y-3" aria-label="Selected session">
          <h4 className="text-xl">{service.title}</h4>
          <p className="leading-relaxed">{service.description}</p>
          <p>
            {service.duration_minutes} minutes · {formatNaira(service.price_minor)}
          </p>
          {service.delivery_format && (
            <p className="text-sm text-muted-foreground">{service.delivery_format}</p>
          )}
        </section>
      )}
      <StepActions>
        <Button type="submit" disabled={!service}>
          Continue
        </Button>
      </StepActions>
    </form>
  );
}

function TimeStep({
  service,
  start,
  notice,
  onSelect,
  onBack,
  onContinue,
}: {
  service: Service;
  start: string;
  notice: string;
  onSelect: (start: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const today = lagosDateKey(new Date());
  const lastDay = addDays(today, BOOKING_HORIZON_DAYS);
  const [from, setFrom] = useState(start ? lagosDateKey(new Date(start)) : today);
  const [day, setDay] = useState(start ? lagosDateKey(new Date(start)) : "");
  const to = addDays(from, WINDOW_DAYS - 1);
  const read = useServerFn(getGuestAvailability);
  const availability = useQuery({
    queryKey: ["aviv-availability", service.slug, from, to],
    queryFn: () => read({ data: { serviceSlug: service.slug, from, to } }),
    staleTime: 0,
  });
  const days = openDaysFrom(from, WINDOW_DAYS, today).filter((d) => d <= to);
  const result = availability.data;
  const byDate = new Map(result?.ok ? result.days.map((d) => [d.date, d]) : []);
  const selected = byDate.get(day);

  // Drop a chosen time that the latest availability no longer offers.
  useEffect(() => {
    if (start && result?.ok && day && !byDate.get(day)?.starts.includes(start)) onSelect("");
  });

  const move = (offset: number) => {
    setFrom(addDays(from, offset));
    setDay("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (start) onContinue();
      }}
    >
      <p className="text-sm mb-6">
        {service.title} · {service.duration_minutes} minutes. All times are in Lagos time (WAT).
      </p>
      {notice && (
        <p role="alert" className="mb-6">
          {notice}
        </p>
      )}
      <fieldset>
        <legend className="mb-4">Choose a day</legend>
        <div className="flex items-center justify-between gap-3 mb-4 text-sm">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={from <= today}
            onClick={() => move(-WINDOW_DAYS)}
          >
            <ChevronLeft /> Earlier dates
          </Button>
          <span className="text-muted-foreground">
            {formatLagosDate(from, "short")} – {formatLagosDate(to, "short")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={addDays(from, WINDOW_DAYS) > lastDay}
            onClick={() => move(WINDOW_DAYS)}
          >
            Later dates <ChevronRight />
          </Button>
        </div>
        {availability.isPending ? (
          <div role="status" aria-label="Loading available days" className="choice-grid">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-28" />
            ))}
          </div>
        ) : !result?.ok ? (
          <div role="alert" className="space-y-4">
            <p>
              {result?.reason === "service"
                ? "This session can't be booked online right now. Please choose another session."
                : "Available times couldn't be loaded. Please try again."}
            </p>
            <Button type="button" variant="outline" onClick={() => void availability.refetch()}>
              Try again
            </Button>
          </div>
        ) : days.length ? (
          <div className="choice-grid">
            {days.map((d) => {
              const info = byDate.get(d);
              const unavailable = !info || info.state !== "open";
              return (
                <label key={d} className="choice">
                  <input
                    type="radio"
                    name="booking-day"
                    value={d}
                    checked={day === d}
                    onChange={() => {
                      setDay(d);
                      onSelect("");
                    }}
                  />
                  <span>
                    {formatLagosDate(d, "short")}
                    {unavailable && <small className="block text-xs opacity-80">No times</small>}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">
            There are no open days in this range. Please choose later dates.
          </p>
        )}
      </fieldset>
      {day && result?.ok && (
        <fieldset className="mt-8">
          <legend className="mb-4">Choose a time on {formatLagosDate(day)}</legend>
          {selected?.state === "open" ? (
            <div className="choice-grid">
              {selected.starts.map((s) => (
                <label key={s} className="choice">
                  <input
                    type="radio"
                    name="booking-time"
                    value={s}
                    checked={start === s}
                    onChange={() => onSelect(s)}
                  />
                  <span>{formatLagosTime(s)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p role="status">{unavailableDayMessage(day, selected?.state)}</p>
          )}
        </fieldset>
      )}
      <StepActions onBack={onBack}>
        <Button type="submit" disabled={!start}>
          Continue
        </Button>
      </StepActions>
    </form>
  );
}

function unavailableDayMessage(day: string, state: string | undefined) {
  const date = formatLagosDate(day);
  if (state === "past")
    return `There are no remaining times on ${date}. Please choose another day.`;
  if (state === "closed")
    return `AVIV is not taking bookings on ${date}. Please choose another day.`;
  return `${date} is fully booked. Please choose another available day.`;
}

const detailFields = [
  {
    key: "name",
    label: "Your name",
    type: "text",
    autoComplete: "name",
    maxLength: 100,
    required: true,
  },
  {
    key: "email",
    label: "Email address",
    type: "email",
    autoComplete: "email",
    maxLength: 254,
    required: true,
  },
  {
    key: "phone",
    label: "Phone number (optional)",
    type: "tel",
    autoComplete: "tel",
    maxLength: 30,
    required: false,
  },
] as const;

function DetailsStep({
  details,
  onChange,
  onBack,
  onContinue,
}: {
  details: Details;
  onChange: (details: Details) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = guestBookingSchema
          .pick({ name: true, email: true, phone: true, policyAccepted: true })
          .safeParse(details);
        if (parsed.success) {
          setErrors({});
          onContinue();
          return;
        }
        const next: Partial<Record<keyof Details, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof Details;
          next[key] ??= issue.message;
        }
        setErrors(next);
        // Send focus to the first field that needs attention.
        const first = Object.keys(next)[0];
        form.current?.querySelector<HTMLElement>(`#booking-${first}`)?.focus();
      }}
    >
      <div className="space-y-5">
        {detailFields.map((f) => (
          <div className="form-field" key={f.key}>
            <label htmlFor={`booking-${f.key}`}>{f.label}</label>
            <Input
              id={`booking-${f.key}`}
              type={f.type}
              autoComplete={f.autoComplete}
              maxLength={f.maxLength}
              required={f.required}
              value={details[f.key]}
              aria-invalid={!!errors[f.key]}
              aria-describedby={errors[f.key] ? `booking-${f.key}-error` : undefined}
              onChange={(e) => onChange({ ...details, [f.key]: e.target.value })}
            />
            {errors[f.key] && (
              <span id={`booking-${f.key}-error`} className="field-error">
                {errors[f.key]}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm mt-6 text-muted-foreground">
        Please share only what's needed to arrange your session. There's no need to include personal
        or counselling details here.
      </p>
      <div className="border-y py-5 mt-6 space-y-3">
        <p className="text-sm">
          No refunds, except where required by law. Rescheduling requests must be made within three
          days after the scheduled appointment; otherwise the booking is cancelled. Exact
          appointment time requires AVIV confirmation.
        </p>
        <div className="flex flex-wrap gap-4 text-sm underline">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/cancellation-policy">Cancellation & rescheduling</Link>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <Checkbox
            id="booking-policyAccepted"
            checked={details.policyAccepted}
            aria-invalid={!!errors.policyAccepted}
            aria-describedby={errors.policyAccepted ? "booking-policyAccepted-error" : undefined}
            onCheckedChange={(v) => onChange({ ...details, policyAccepted: v === true })}
          />
          <label htmlFor="booking-policyAccepted">
            I have read and accept the booking policies.
          </label>
        </div>
        {errors.policyAccepted && (
          <span id="booking-policyAccepted-error" className="field-error block">
            {errors.policyAccepted}
          </span>
        )}
      </div>
      <StepActions onBack={onBack}>
        <Button type="submit">Review booking</Button>
      </StepActions>
    </form>
  );
}

function ReviewStep({
  service,
  start,
  details,
  onBack,
  onHeld,
  onSlotLost,
}: {
  service: Service;
  start: string;
  details: Details;
  onBack: () => void;
  onHeld: (held: Held) => void;
  onSlotLost: (message: string) => void;
}) {
  const submit = useServerFn(submitGuestBooking);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const end = new Date(new Date(start).getTime() + Number(service.duration_minutes) * 60000);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          const result = await submit({
            data: {
              serviceSlug: service.slug,
              start,
              ...details,
              policyAccepted: true,
              website: "",
            },
          });
          if (result.created) return onHeld(result);
          if (["unavailable", "past", "outside_schedule"].includes(result.reason)) {
            await queryClient.invalidateQueries({ queryKey: ["aviv-availability"] });
            return onSlotLost(result.message);
          }
          setNotice(result.message);
        } catch {
          setNotice("Please check your details and try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <dl className="booking-summary">
        <dt>Session</dt>
        <dd>{service.title}</dd>
        <dt>Date</dt>
        <dd>{formatLagosDate(lagosDateKey(new Date(start)))}</dd>
        <dt>Time</dt>
        <dd>
          {formatLagosTime(start)} – {formatLagosTime(end)} (Lagos time)
        </dd>
        <dt>Duration</dt>
        <dd>{service.duration_minutes} minutes</dd>
        <dt>Fee</dt>
        <dd>{formatNaira(service.price_minor)}</dd>
        <dt>Name</dt>
        <dd>{details.name}</dd>
        <dt>Email</dt>
        <dd className="break-words">{details.email}</dd>
      </dl>
      <div className="mt-6 space-y-3 text-sm leading-relaxed">
        <p>
          When you continue, we'll hold this time for you for 30 minutes and give you a private link
          to your booking.
        </p>
        <p>
          Online payment is not available yet, so no payment will be taken. If payment can't be
          completed while the time is held, the hold ends and the time is released. Your appointment
          is only confirmed by AVIV after payment.
        </p>
      </div>
      {notice && (
        <p role="alert" className="mt-6">
          {notice}
        </p>
      )}
      <StepActions onBack={onBack}>
        <Button type="submit" disabled={busy}>
          {busy ? "Holding your time…" : "Hold this time"}
        </Button>
      </StepActions>
    </form>
  );
}

function HeldConfirmation({
  held,
  service,
  headingRef,
}: {
  held: Held;
  service: Service;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const path = `/booking/manage/${held.token}`;
  const link = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <section className="max-w-2xl" aria-labelledby="held-heading">
      <h3 id="held-heading" ref={headingRef} tabIndex={-1} className="text-3xl mb-4 outline-none">
        Your time is held.
      </h3>
      <p className="section-copy mb-8">
        We're holding {formatLagosDateTime(held.start)} for you until{" "}
        {formatLagosTime(held.holdExpiresAt)} (Lagos time).
      </p>
      <dl className="booking-summary">
        <dt>Reference</dt>
        <dd className="break-all">{held.reference}</dd>
        <dt>Session</dt>
        <dd>
          {service.title} · {service.duration_minutes} minutes
        </dd>
        <dt>Fee</dt>
        <dd>{formatNaira(service.price_minor)}</dd>
      </dl>
      <div className="mt-8 space-y-4">
        <h4 className="text-xl">Your private booking link</h4>
        <p className="text-sm leading-relaxed">
          Save this link somewhere safe. It's the only way to view your booking, as email
          confirmations are not enabled yet. Anyone with the link can see your booking status, so
          please don't share it.
        </p>
        <Input
          readOnly
          value={link}
          aria-label="Private booking link"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button asChild>
            <a href={path}>
              View my booking <ArrowUpRight />
            </a>
          </Button>
        </div>
        <p role="status" className="sr-only">
          {copied ? "Link copied" : ""}
        </p>
      </div>
      <p className="text-sm mt-8 leading-relaxed text-muted-foreground">
        Online payment is not available yet. No payment has been taken, and this hold will end at{" "}
        {formatLagosTime(held.holdExpiresAt)} unless payment is completed.
      </p>
    </section>
  );
}
