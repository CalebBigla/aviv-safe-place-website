import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
  availabilitySchema,
  guestBookingSchema,
  guestTokenSchema,
  type AvailabilityDay,
  type AvailabilityResult,
  type BookingFailure,
  type GuestBookingRead,
  type GuestBookingResult,
} from "./guest-booking-schema";
import { publicClient } from "./public-client";
import { isScheduledSlot, isSessionDuration, lagosDateKey } from "./schedule";
import { clientKey, randomToken, serviceClient, sha256Hex } from "./request.server";

const failureMessages: Record<BookingFailure, string> = {
  unavailable: "That time is no longer available. Please choose another time.",
  past: "That time has already passed. Please choose another time.",
  outside_schedule: "Please choose one of the available times shown.",
  service: "This session is not available to book right now. Please choose another session.",
  invalid: "Please check your details and try again.",
  too_many_holds:
    "You already have two times held. Please wait for an existing hold to finish before choosing another.",
  rate_limited:
    "There have been too many booking attempts. Please wait a little while and try again.",
  infrastructure: "Booking is temporarily unavailable. Please try again shortly or contact AVIV.",
};

// Database exceptions raised by aviv_create_guest_request.
const databaseFailures: Record<string, BookingFailure> = {
  AVIV_SLOT_UNAVAILABLE: "unavailable",
  AVIV_SLOT_PAST: "past",
  AVIV_SLOT_OUTSIDE_SCHEDULE: "outside_schedule",
  AVIV_SERVICE_UNAVAILABLE: "service",
  AVIV_INVALID_DETAILS: "invalid",
  AVIV_TOO_MANY_HOLDS: "too_many_holds",
};

const fail = (reason: BookingFailure): GuestBookingResult => ({
  created: false,
  reason,
  message: failureMessages[reason],
});

// Free start times per open day, straight from the database. Only times are exposed.
export const getGuestAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => availabilitySchema.parse(input))
  .handler(async ({ data }): Promise<AvailabilityResult> => {
    setResponseHeader("Cache-Control", "no-store");
    const client = publicClient();
    const service = await client
      .from("services")
      .select("duration_minutes")
      .eq("slug", data.serviceSlug)
      .eq("published", true)
      .eq("active", true)
      .maybeSingle();
    if (service.error) {
      console.error("[aviv-availability] service lookup failed", service.error.code);
      return { ok: false, reason: "unavailable" };
    }
    const duration = service.data?.duration_minutes;
    if (!isSessionDuration(duration)) return { ok: false, reason: "service" };
    const slots = await client.rpc("aviv_slot_availability", {
      _from: data.from,
      _to: data.to,
      _minutes: duration,
    });
    if (slots.error) {
      console.error("[aviv-availability] availability query failed", slots.error.code);
      return { ok: false, reason: "unavailable" };
    }
    const byDay = new Map<string, { starts: string[]; reasons: Set<string> }>();
    for (const slot of slots.data ?? []) {
      const key = lagosDateKey(new Date(slot.slot_start));
      const day = byDay.get(key) ?? { starts: [], reasons: new Set<string>() };
      if (slot.available) day.starts.push(new Date(slot.slot_start).toISOString());
      else day.reasons.add(slot.reason ?? "taken");
      byDay.set(key, day);
    }
    const days: AvailabilityDay[] = [...byDay].map(([date, { starts, reasons }]) => ({
      date,
      starts,
      state: starts.length
        ? "open"
        : [...reasons].every((r) => r === "past" || r === "outside_window")
          ? "past"
          : [...reasons].every((r) => r === "blocked" || r === "past")
            ? "closed"
            : "full",
    }));
    return { ok: true, duration, days };
  });

// Creates a 30-minute hold and returns the guest's manage token once. Payment is not
// available yet, so the hold lapses unless a verified payment is recorded in a later phase.
export const submitGuestBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => guestBookingSchema.parse(input))
  .handler(async ({ data }): Promise<GuestBookingResult> => {
    setResponseHeader("Cache-Control", "no-store");
    if (data.website) return fail("invalid");
    const start = new Date(data.start);
    if (!isScheduledSlot(start, 30) && !isScheduledSlot(start, 60)) return fail("outside_schedule");
    let db;
    try {
      db = await serviceClient();
    } catch {
      return fail("infrastructure");
    }
    const key = await clientKey();
    const limit = await db.rpc("aviv_consume_rate_limit", {
      _bucket: `booking-create:${key}`,
      _limit: 6,
      _window_seconds: 3600,
    });
    if (limit.error) {
      console.error("[aviv-booking] rate limit check failed", limit.error.code);
      return fail("infrastructure");
    }
    if (!limit.data) return fail("rate_limited");
    const token = randomToken();
    const result = await db.rpc("aviv_create_guest_request", {
      _service_slug: data.serviceSlug,
      _name: data.name,
      _email: data.email,
      _phone: data.phone,
      _start: start.toISOString(),
      _token_hash: await sha256Hex(token),
    });
    if (result.error) {
      const reason = databaseFailures[result.error.message];
      if (!reason) console.error("[aviv-booking] hold creation failed", result.error.code);
      return fail(reason ?? "infrastructure");
    }
    const row = result.data;
    if (!row || typeof row !== "object" || Array.isArray(row)) return fail("infrastructure");
    return {
      created: true,
      token,
      reference: String(row["reference"]),
      start: String(row["start"]),
      end: String(row["end"]),
      holdExpiresAt: String(row["hold_expires_at"]),
    };
  });

export const readGuestBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => guestTokenSchema.parse(input))
  .handler(async ({ data }): Promise<GuestBookingRead> => {
    setResponseHeader("Cache-Control", "no-store");
    let db;
    try {
      db = await serviceClient();
    } catch {
      return { status: "infrastructure" };
    }
    const result = await db.rpc("aviv_read_guest_booking", {
      _hash: await sha256Hex(data.token),
      _client_key: await clientKey(),
    });
    if (result.error) {
      console.error("[aviv-guest-booking] readback failed", result.error.code);
      return { status: "infrastructure" };
    }
    const b = result.data;
    if (!b || typeof b !== "object" || Array.isArray(b)) return { status: "unavailable" };
    if (b["rate_limited"] === true) return { status: "rate_limited" };
    const text = (key: string) => (typeof b[key] === "string" ? (b[key] as string) : null);
    return {
      status: "found",
      booking: {
        reference: String(b["reference"]),
        service: String(b["service"]),
        price_minor: Number(b["price_minor"]),
        currency: String(b["currency"]),
        duration_minutes: typeof b["duration_minutes"] === "number" ? b["duration_minutes"] : null,
        requested_start: text("requested_start"),
        confirmed_start: text("confirmed_start"),
        confirmed_end: text("confirmed_end"),
        payment_status: String(b["payment_status"]),
        booking_status: String(b["booking_status"]),
        hold_expires_at: text("hold_expires_at"),
        time_zone: String(b["time_zone"]),
      },
    };
  });
