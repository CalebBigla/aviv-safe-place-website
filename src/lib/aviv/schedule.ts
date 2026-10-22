// AVIV's fixed booking schedule, browser-safe. This mirrors public.aviv_slot_valid for
// display and validation messages only: the database decides what can actually be held.
//
// Africa/Lagos observes West Africa Time (UTC+01:00) all year with no daylight saving,
// so a Lagos wall-clock time maps to an instant with a fixed +01:00 offset.

export const AVIV_TIME_ZONE = "Africa/Lagos";
export const LAGOS_OFFSET = "+01:00";
export const SESSION_DURATIONS = [30, 60] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];
export const SLOT_GRID_MINUTES = 30;
export const OPENING_MINUTE = 10 * 60;
export const BOOKING_HORIZON_DAYS = 180;

// Closing minute of day by ISO weekday (1 = Monday). Missing days are closed.
export const CLOSING_MINUTE: Partial<Record<number, number>> = {
  1: 13 * 60,
  3: 13 * 60,
  6: 15 * 60,
};

export const isSessionDuration = (value: unknown): value is SessionDuration =>
  SESSION_DURATIONS.includes(value as SessionDuration);

// ISO weekday (1-7) of a Lagos calendar date written as YYYY-MM-DD.
export function isoWeekday(dateKey: string) {
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const isOpenDay = (dateKey: string) => CLOSING_MINUTE[isoWeekday(dateKey)] !== undefined;

// Start minutes (from midnight Lagos time) on the 30-minute grid. Starts run from 10:00 to
// one hour before closing, and the session must end by closing.
export function slotStartMinutes(dateKey: string, minutes: SessionDuration): number[] {
  const close = CLOSING_MINUTE[isoWeekday(dateKey)];
  if (close === undefined) return [];
  const starts: number[] = [];
  for (let m = OPENING_MINUTE; m <= close - 60 && m + minutes <= close; m += SLOT_GRID_MINUTES)
    starts.push(m);
  return starts;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const lagosInstant = (dateKey: string, minuteOfDay: number) =>
  new Date(
    `${dateKey}T${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}:00${LAGOS_OFFSET}`,
  );

// Lagos calendar date (YYYY-MM-DD) of an instant.
export const lagosDateKey = (instant: Date) =>
  new Date(instant.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);

export function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whether an instant is a valid AVIV start for the given duration, ignoring availability.
export function isScheduledSlot(instant: Date, minutes: number) {
  if (!isSessionDuration(minutes) || Number.isNaN(instant.getTime())) return false;
  if (instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) return false;
  const dateKey = lagosDateKey(instant);
  const minuteOfDay = (instant.getUTCHours() + 1) * 60 + instant.getUTCMinutes();
  return slotStartMinutes(dateKey, minutes).includes(minuteOfDay % (24 * 60));
}

// Upcoming open days (Mon/Wed/Sat) from `fromKey`, inclusive, within the booking horizon.
export function openDaysFrom(fromKey: string, count: number, todayKey = fromKey) {
  const last = addDays(todayKey, BOOKING_HORIZON_DAYS);
  const days: string[] = [];
  for (let key = fromKey; days.length < count && key <= last; key = addDays(key, 1))
    if (isOpenDay(key)) days.push(key);
  return days;
}

export const formatLagosDate = (dateKey: string, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("en-NG", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00Z`));

export const formatLagosTime = (instant: Date | string) =>
  new Intl.DateTimeFormat("en-NG", {
    timeZone: AVIV_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));

export const formatLagosDateTime = (instant: Date | string) =>
  new Intl.DateTimeFormat("en-NG", {
    timeZone: AVIV_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(instant));
