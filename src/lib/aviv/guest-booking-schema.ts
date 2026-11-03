import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().min(1).max(100);

export const availabilitySchema = z
  .object({ serviceSlug: slug, from: dateKey, to: dateKey })
  .refine((v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 32 * 86400000, {
    message: "Choose a shorter date range.",
  });

export const guestBookingSchema = z.object({
  serviceSlug: slug,
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2, "Please enter your full name.").max(100),
  email: z.string().trim().email("Please enter a valid email address.").max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^(\+?[\d\s()-]{7,30})?$/, "Please enter a valid phone number or leave it blank.")
    .default(""),
  policyAccepted: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you have read the booking policies." }),
  }),
  website: z.string().max(100).default(""),
});

// Manage tokens are 32 random bytes, hex encoded (256 bits).
export const guestTokenSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;

// open: at least one free time; full: every slot is taken by confirmed/pending bookings;
// past: no remaining times today; closed: AVIV has blocked the day.
export type AvailabilityDay = {
  date: string;
  starts: string[];
  state: "open" | "full" | "past" | "closed";
};
export type AvailabilityResult =
  | { ok: true; duration: number; days: AvailabilityDay[] }
  | { ok: false; reason: "service" | "unavailable" };

export type BookingFailure =
  | "unavailable"
  | "past"
  | "outside_schedule"
  | "service"
  | "invalid"
  | "too_many_holds"
  | "rate_limited"
  | "infrastructure";

export type GuestBookingResult =
  | {
      created: true;
      token: string;
      reference: string;
      start: string;
      end: string;
      holdExpiresAt: string;
    }
  | { created: false; reason: BookingFailure; message: string };

export interface GuestBookingDetails {
  reference: string;
  service: string;
  price_minor: number;
  currency: string;
  duration_minutes: number | null;
  requested_start: string | null;
  confirmed_start: string | null;
  confirmed_end: string | null;
  payment_status: string;
  booking_status: string;
  hold_expires_at: string | null;
  time_zone: string;
}

export type GuestBookingRead =
  | { status: "found"; booking: GuestBookingDetails }
  | { status: "unavailable" | "rate_limited" | "infrastructure" };
