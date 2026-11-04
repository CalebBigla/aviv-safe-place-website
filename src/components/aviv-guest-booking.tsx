import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Copy,
} from "lucide-react";
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
  isOpenDay,
  isSessionDuration,
  lagosDateKey,
  openDaysFrom,
} from "@/lib/aviv/schedule";
import { BotCheck, botCheckEnabled } from "@/components/aviv-turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

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

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
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

  const go = (next: Step) => { setNotice(""); setStep(next); };
  const index = steps.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl">
      {/* Progress bar */}
      <ol aria-label="Booking progress" className="flex gap-0 mb-10 relative">
        <div
          className="absolute top-4 left-0 right-0 h-px bg-border"
          aria-hidden="true"
        />
        <div
          className="booking-progress-fill"
          style={{ width: `${(index / (steps.length - 1)) * 75}%` }}
          aria-hidden="true"
        />
        {steps.map((s, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={s.key} className="flex-1 flex flex-col items-center gap-2 relative z-10">
              <div
                className={[
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-background border border-border text-muted-foreground",
                ].join(" ")}
              >
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span
                className={[
                  "text-xs hidden sm:block",
                  active ? "font-semibold" : "text-muted-foreground",
                ].join(" ")}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <h3 key={`${step}-heading`} ref={heading} tabIndex={-1} className="text-2xl mb-6 outline-none step-enter">
        {steps[index]?.label}
      </h3>

      <div key={step} className="step-enter">
        {step === "session" && (
          <SessionStep
            services={services}
            slug={slug}
            onChange={(next) => { setSlug(next); setStart(""); }}
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

/* ── Step 1: Session ─────────────────────────────────────────────── */
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
    <form onSubmit={(e) => { e.preventDefault(); if (service) onContinue(); }}>
      <p className="text-sm text-muted-foreground mb-6">
        Choose the type of session you'd like to request.
      </p>
      <div className="session-cards stagger">
        {services.map((s) => (
          <button
            key={s.slug}
            type="button"
            className={`session-card animate-fade-up${slug === s.slug ? " is-selected" : ""}`}
            aria-pressed={slug === s.slug}
            onClick={() => onChange(s.slug)}
          >
            <span className="session-card-check" aria-hidden="true"><Check size={13} /></span>
            <h4>{s.title}</h4>
            {s.description && <p>{s.description}</p>}
            <div className="session-card-meta">
              {s.duration_minutes && (
                <span className="session-card-tag"><Clock size={11} className="inline mr-1" />{s.duration_minutes} min</span>
              )}
              {s.price_minor !== null && (
                <span className="session-card-tag">{formatNaira(s.price_minor)}</span>
              )}
              {s.delivery_format && (
                <span className="session-card-tag">{s.delivery_format}</span>
              )}
            </div>
          </button>
        ))}
      </div>
      {service?.full_description && (
        <div className="mt-4 text-sm text-muted-foreground leading-relaxed animate-fade-in border-l-2 border-accent pl-4">
          {service.full_description}
        </div>
      )}
      <StepActions>
        <Button type="submit" disabled={!service}>
          Continue <ArrowUpRight size={16} />
        </Button>
      </StepActions>
    </form>
  );
}

/* ── Step 2: Date & time (calendar modal) ─────────────────────────── */
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
  const [calOpen, setCalOpen] = useState(false);

  // Month navigation state: "YYYY-MM"
  const toMonthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  // Open on the month that contains the first future open day (Mon/Wed/Sat).
  // If the current month still has upcoming open days, stay on it. Otherwise
  // advance to the next month so the user never opens to a page of all-grey days.
  function firstUsefulMonth(): string {
    // Find the next open day from today
    const nextOpen = openDaysFrom(today, 1, today)[0];
    if (!nextOpen) return today.slice(0, 7);
    return nextOpen.slice(0, 7);
  }

  const initialMonth = start ? lagosDateKey(new Date(start)).slice(0, 7) : firstUsefulMonth();
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState(start ? lagosDateKey(new Date(start)) : "");

  // Derive month boundaries
  const [yearN, monN] = month.split("-").map(Number) as [number, number];
  const firstOfMonth = new Date(Date.UTC(yearN, monN - 1, 1));
  const lastOfMonth = new Date(Date.UTC(yearN, monN, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastOfMonth).padStart(2, "0")}`;
  // Mon-first offset: (UTCDay + 6) % 7 → Mon=0 … Sun=6
  const startDow = (firstOfMonth.getUTCDay() + 6) % 7;

  const read = useServerFn(getGuestAvailability);
  const availability = useQuery({
    queryKey: ["aviv-availability", service.slug, from, to],
    queryFn: () => read({ data: { serviceSlug: service.slug, from, to } }),
    // Keep data fresh for 60 s; re-fetch when the modal opens so the user
    // always sees current availability — not a stale snapshot.
    staleTime: 60_000,
    retry: 2,
  });

  const result = availability.data;
  // Map of YYYY-MM-DD → AvailabilityDay (only exists when the query resolved ok)
  const byDate = new Map(result?.ok ? result.days.map((d) => [d.date, d]) : []);
  // apiResolved: true only when we have a successful response with actual data.
  // An error, a failed result, or undefined all mean "not yet resolved."
  const apiResolved = result?.ok === true;

  // If the API came back and the previously chosen time is no longer available,
  // clear it so the user must re-pick.
  useEffect(() => {
    if (
      start &&
      result?.ok &&
      selectedDay &&
      !byDate.get(selectedDay)?.starts.includes(start)
    ) {
      onSelect("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Month navigation
  const prevMonth = () => {
    const d = new Date(Date.UTC(yearN, monN - 2, 1));
    setMonth(toMonthKey(d));
    setSelectedDay("");
    onSelect("");
  };
  const nextMonth = () => {
    const d = new Date(Date.UTC(yearN, monN, 1));
    setMonth(toMonthKey(d));
    setSelectedDay("");
    onSelect("");
  };
  const canGoBack = month > firstUsefulMonth();
  const canGoForward = month < lastDay.slice(0, 7);

  const monthLabel = new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstOfMonth);

  const selectedDayInfo = byDate.get(selectedDay);
  const hasStart = !!start;

  // Legend helpers
  const dayStatus = (key: string) => {
    const isPast = key < today;
    const isBeyond = key > lastDay;
    const isScheduleDay = isOpenDay(key);
    if (isPast || isBeyond || !isScheduleDay) return "off" as const;
    if (!apiResolved) return "loading" as const;
    const info = byDate.get(key);
    // No entry in the map after a successful response means the DB returned no
    // slot rows for this day — treat as available so it is clickable (the server
    // will confirm on submission). This avoids falsely blocking valid open days.
    if (!info) return "available" as const;
    if (info.state === "open") return "available" as const;
    if (info.state === "full") return "booked" as const;
    if (info.state === "closed") return "blocked" as const;
    return "off" as const; // "past" — no remaining times
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (hasStart) onContinue(); }}>
      <p className="text-sm text-muted-foreground mb-6">
        {service.title} · {service.duration_minutes} min · All times are Lagos time (WAT).
      </p>
      {notice && <p role="alert" className="mb-6 text-sm text-destructive">{notice}</p>}

      {/* Trigger button */}
      <button
        type="button"
        className={`date-trigger${hasStart ? " has-value" : ""}`}
        onClick={() => setCalOpen(true)}
      >
        <span className="flex items-center gap-3 text-sm">
          <CalendarDays size={17} className="text-muted-foreground" />
          {hasStart
            ? `${formatLagosDate(selectedDay)} · ${formatLagosTime(start)}`
            : "Pick a date & time"}
        </span>
        <span className="text-xs text-muted-foreground">{hasStart ? "Change" : "Open calendar"}</span>
      </button>

      {/* Selected slot summary */}
      {hasStart && (
        <div className="selected-slot-card animate-fade-in">
          <div>
            <div className="slot-label">Date</div>
            <div className="slot-value">{formatLagosDate(selectedDay)}</div>
          </div>
          <div>
            <div className="slot-label">Time</div>
            <div className="slot-value">{formatLagosTime(start)}</div>
          </div>
          <div>
            <div className="slot-label">Duration</div>
            <div className="slot-value">{service.duration_minutes} min</div>
          </div>
        </div>
      )}

      {/* ── Calendar Modal ── */}
      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent className="max-h-[min(92dvh,660px)] w-[calc(100%-2rem)] max-w-[400px] gap-3 overflow-y-auto rounded-lg p-5 pb-0">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle>Choose a date &amp; time</DialogTitle>
            <DialogDescription className="text-xs">
              Lagos time (WAT, UTC+1). AVIV confirms after payment.
            </DialogDescription>
          </DialogHeader>

          {/* Month nav */}
          <div className="calendar">
            <div className="calendar-nav">
              <button
                type="button"
                onClick={prevMonth}
                disabled={!canGoBack}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="calendar-month">{monthLabel}</span>
              <button
                type="button"
                onClick={nextMonth}
                disabled={!canGoForward}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* API error banner */}
            {result && !result.ok && (
              <div className="cal-error" role="alert">
                <span>
                  {result.reason === "service"
                    ? "This session can't be booked online right now."
                    : "Availability couldn't be loaded."}
                </span>
                <button
                  type="button"
                  className="underline text-xs ml-3"
                  onClick={() => void availability.refetch()}
                >
                  Try again
                </button>
              </div>
            )}

            {/* Calendar grid */}
            <div className="calendar-grid" role="grid" aria-label={`${monthLabel} calendar`}>
              {/* Day-of-week headers */}
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="calendar-dow" role="columnheader" aria-label={d}>{d}</div>
              ))}

              {/* Offset cells */}
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={`e${i}`} className="calendar-day is-empty" role="gridcell" />
              ))}

              {/* Day cells */}
              {Array.from({ length: lastOfMonth }).map((_, idx) => {
                const day = idx + 1;
                const key = `${month}-${String(day).padStart(2, "0")}`;
                const status = dayStatus(key);
                const isSelected = key === selectedDay;
                const isToday = key === today;

                // aria-label includes the status so screen-readers get context
                const statusLabel =
                  status === "available"
                    ? "available"
                    : status === "booked"
                    ? "fully booked"
                    : status === "blocked"
                    ? "unavailable"
                    : status === "loading"
                    ? "checking availability"
                    : "not a session day";

                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    className={[
                      "calendar-day",
                      `is-${status}`,
                      isSelected ? "is-selected" : "",
                      isToday && !isSelected ? "is-today" : "",
                    ].filter(Boolean).join(" ")}
                    disabled={status === "off" || status === "booked" || status === "blocked" || status === "loading"}
                    onClick={() => { setSelectedDay(key); onSelect(""); }}
                    aria-label={`${formatLagosDate(key)}, ${statusLabel}`}
                    aria-pressed={isSelected}
                  >
                    {day}
                    {/* Small dot indicator for available/booked days */}
                    {(status === "available" || status === "booked") && !isSelected && (
                      <span
                        className={`cal-dot ${status === "available" ? "cal-dot--open" : "cal-dot--full"}`}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="cal-legend" aria-label="Calendar legend">
              <span><span className="cal-dot cal-dot--open" aria-hidden="true" />Available</span>
              <span><span className="cal-dot cal-dot--full" aria-hidden="true" />Fully booked</span>
            </div>

            {/* Loading text */}
            {availability.isPending && (
              <p className="text-xs text-muted-foreground text-center mt-1" role="status" aria-live="polite">
                Checking availability…
              </p>
            )}
            {/* Show a friendly message when the query errored */}
            {availability.isError && (
              <div className="cal-error mt-2" role="alert">
                <span>Could not load availability.</span>
                <button
                  type="button"
                  className="underline text-xs ml-3"
                  onClick={() => void availability.refetch()}
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          {/* Time slots for the selected day */}
          {selectedDay && (
            <div className="calendar-times">
              {availability.isPending ? (
                <div className="flex gap-2 flex-wrap" role="status" aria-label="Loading times">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-20" />)}
                </div>
              ) : selectedDayInfo?.state === "open" && selectedDayInfo.starts.length ? (
                <>
                  <p className="text-sm font-medium mb-2">
                    Times on {formatLagosDate(selectedDay, "short")}
                  </p>
                  <div className="choice-grid" role="radiogroup" aria-label="Available times">
                    {selectedDayInfo.starts.map((s) => (
                      <label key={s} className="choice">
                        <input
                          type="radio"
                          name="modal-time"
                          value={s}
                          checked={start === s}
                          onChange={() => onSelect(s)}
                        />
                        <span>{formatLagosTime(s)}</span>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <div className="cal-day-status" role="status">
                  {unavailableDayReason(selectedDay, selectedDayInfo?.state)}
                </div>
              )}
            </div>
          )}

          {/* Confirm button */}
          <div className="calendar-confirm">
            <Button
              type="button"
              className="w-full"
              disabled={!start}
              onClick={() => setCalOpen(false)}
            >
              {start ? `Confirm — ${formatLagosTime(start)}` : "Select a time to confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StepActions onBack={onBack}>
        <Button type="submit" disabled={!hasStart}>
          Continue <ArrowUpRight size={16} />
        </Button>
      </StepActions>
    </form>
  );
}

function unavailableDayReason(day: string, state: string | undefined) {
  const date = formatLagosDate(day, "short");
  if (state === "past")
    return `No remaining times on ${date}. Choose another day.`;
  if (state === "closed")
    return `AVIV is not available on ${date}. Choose another day.`;
  if (state === "full")
    return `${date} is fully booked. All sessions have been taken. Choose another day.`;
  return `No times are available on ${date}. Choose another day.`;
}

/* ── Step 3: Details ─────────────────────────────────────────────── */
const detailFields = [
  { key: "name", label: "Your name", type: "text", autoComplete: "name", maxLength: 100, required: true },
  { key: "email", label: "Email address", type: "email", autoComplete: "email", maxLength: 254, required: true },
  { key: "phone", label: "Phone number (optional)", type: "tel", autoComplete: "tel", maxLength: 30, required: false },
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
        if (parsed.success) { setErrors({}); onContinue(); return; }
        const next: Partial<Record<keyof Details, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof Details;
          next[key] ??= issue.message;
        }
        setErrors(next);
        const first = Object.keys(next)[0];
        form.current?.querySelector<HTMLElement>(`#booking-${first}`)?.focus();
      }}
    >
      <div className="space-y-5 stagger">
        {detailFields.map((f) => (
          <div className="form-field animate-fade-up" key={f.key}>
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
              <span id={`booking-${f.key}-error`} className="field-error">{errors[f.key]}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm mt-6 text-muted-foreground">
        Please share only what's needed to arrange your session.
      </p>
      <div className="border-y py-5 mt-6 space-y-3">
        <p className="text-sm">
          No refunds except where required by law. Rescheduling requests must be made within three
          days after the scheduled appointment; otherwise the booking is cancelled. Exact appointment
          time requires AVIV confirmation.
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

/* ── Step 4: Review ──────────────────────────────────────────────── */
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
  const [botToken, setBotToken] = useState("");
  const [botAttempt, setBotAttempt] = useState(0);
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
              turnstileToken: botToken,
            },
          });
          if (result.created) return onHeld(result);
          // Tokens are single use, so a failed attempt needs a new one.
          setBotAttempt((attempt) => attempt + 1);
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
      <dl className="booking-summary animate-fade-in">
        <dt>Session</dt>
        <dd>{service.title}</dd>
        <dt>Date</dt>
        <dd>{formatLagosDate(lagosDateKey(new Date(start)))}</dd>
        <dt>Time</dt>
        <dd>{formatLagosTime(start)} – {formatLagosTime(end)} (Lagos time)</dd>
        <dt>Duration</dt>
        <dd>{service.duration_minutes} minutes</dd>
        <dt>Fee</dt>
        <dd>{formatNaira(service.price_minor)}</dd>
        <dt>Name</dt>
        <dd>{details.name}</dd>
        <dt>Email</dt>
        <dd className="break-words">{details.email}</dd>
      </dl>
      <div className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          When you continue, we'll hold this time for 30 minutes and give you a private link to your booking.
        </p>
        <p>
          Online payment is not available yet; no payment will be taken. Your appointment is only confirmed by AVIV after payment.
        </p>
        <p>
          Once AVIV confirms, your private video link will be sent to {details.email}.
        </p>
      </div>
      <BotCheck onToken={setBotToken} resetKey={botAttempt} />
      {notice && <p role="alert" className="mt-6 text-destructive text-sm">{notice}</p>}
      <StepActions onBack={onBack}>
        <Button type="submit" disabled={busy || (botCheckEnabled && !botToken)}>
          {busy ? "Holding your time…" : "Hold this time"}
        </Button>
      </StepActions>
    </form>
  );
}

/* ── Confirmation ────────────────────────────────────────────────── */
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
    <section className="max-w-2xl animate-fade-up" aria-labelledby="held-heading">
      <span className="held-check" aria-hidden="true"><Check size={22} /></span>
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
        <dd>{service.title} · {service.duration_minutes} minutes</dd>
        <dt>Fee</dt>
        <dd>{formatNaira(service.price_minor)}</dd>
      </dl>
      <div className="mt-8 space-y-4">
        <h4 className="text-xl">Your private booking link</h4>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Use this link to check your booking status. You don't need it for your session: once AVIV confirms your appointment, your video link will be emailed to you. Anyone with this link can see your booking status, so please keep it private.
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
              } catch { setCopied(false); }
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Link copied" : "Copy link"}
          </Button>
          <Button asChild>
            <a href={path}>View my booking <ArrowUpRight /></a>
          </Button>
        </div>
        <p role="status" className="sr-only">{copied ? "Link copied" : ""}</p>
      </div>
      <p className="text-sm mt-8 leading-relaxed text-muted-foreground">
        No payment has been taken. This hold will end at {formatLagosTime(held.holdExpiresAt)} unless payment is completed.
      </p>
    </section>
  );
}
