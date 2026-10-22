import { describe, expect, it } from "vitest";
import {
  availabilitySchema,
  guestBookingSchema,
  guestTokenSchema,
} from "@/lib/aviv/guest-booking-schema";
import {
  formatLagosDate,
  isOpenDay,
  isScheduledSlot,
  lagosDateKey,
  lagosInstant,
  openDaysFrom,
  slotStartMinutes,
} from "@/lib/aviv/schedule";

// 2027-03-15 is a Monday.
const days = {
  mon: "2027-03-15",
  tue: "2027-03-16",
  wed: "2027-03-17",
  thu: "2027-03-18",
  fri: "2027-03-19",
  sat: "2027-03-20",
  sun: "2027-03-21",
};
const times = (dateKey: string, minutes: 30 | 60) =>
  slotStartMinutes(dateKey, minutes).map(
    (m) => `${String((m / 60) | 0).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
  );
const at = (dateKey: string, time: string) => new Date(`${dateKey}T${time}:00+01:00`);

describe("AVIV schedule", () => {
  it("opens Monday, Wednesday and Saturday only", () => {
    expect([days.mon, days.wed, days.sat].every(isOpenDay)).toBe(true);
    expect([days.tue, days.thu, days.fri, days.sun].some(isOpenDay)).toBe(false);
    expect(times(days.tue, 30)).toEqual([]);
    expect(times(days.sun, 60)).toEqual([]);
  });

  it("offers the exact weekday and Saturday start times", () => {
    expect(times(days.mon, 30)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
    expect(times(days.wed, 60)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
    expect(times(days.sat, 30)).toEqual([
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
    ]);
    expect(times(days.sat, 60)).toEqual(times(days.sat, 30));
  });

  it("accepts only 30 and 60 minute sessions", () => {
    expect(isScheduledSlot(at(days.mon, "10:00"), 30)).toBe(true);
    expect(isScheduledSlot(at(days.mon, "10:00"), 60)).toBe(true);
    for (const minutes of [15, 45, 90, 120])
      expect(isScheduledSlot(at(days.mon, "10:00"), minutes)).toBe(false);
  });

  it("applies opening, closing and grid boundaries", () => {
    expect(isScheduledSlot(at(days.mon, "09:30"), 30)).toBe(false);
    expect(isScheduledSlot(at(days.mon, "10:15"), 30)).toBe(false);
    expect(isScheduledSlot(at(days.mon, "12:30"), 60)).toBe(false);
    expect(isScheduledSlot(at(days.sat, "14:00"), 60)).toBe(true);
    expect(isScheduledSlot(at(days.sat, "14:30"), 60)).toBe(false);
    expect(isScheduledSlot(new Date(`${days.mon}T10:00:30+01:00`), 30)).toBe(false);
  });

  it("uses Africa/Lagos wall-clock time, not the device time zone", () => {
    expect(isScheduledSlot(new Date(`${days.mon}T09:00:00Z`), 30)).toBe(true); // 10:00 Lagos
    expect(isScheduledSlot(new Date(`${days.mon}T10:00:00Z`), 30)).toBe(true); // 11:00 Lagos
    expect(isScheduledSlot(new Date(`${days.mon}T10:00:00-05:00`), 30)).toBe(false); // 16:00 Lagos
    expect(lagosInstant(days.mon, 600).toISOString()).toBe(`${days.mon}T09:00:00.000Z`);
    expect(lagosDateKey(new Date("2027-03-15T23:30:00Z"))).toBe(days.tue); // 00:30 Tuesday in Lagos
    expect(formatLagosDate(days.mon)).toMatch(/^Monday,? 15 March$/);
  });

  it("lists upcoming open days within the booking horizon", () => {
    expect(openDaysFrom(days.mon, 4)).toEqual([days.mon, days.wed, days.sat, "2027-03-22"]);
    expect(openDaysFrom("2027-09-12", 3, "2027-03-15")).toEqual([]);
  });
});

describe("Guest booking validation", () => {
  const base = {
    serviceSlug: "approved",
    start: "2027-03-15T10:00:00+01:00",
    name: "Guest Client",
    email: "guest@example.com",
    policyAccepted: true,
  };
  it("requires a valid email and explicit policy acknowledgement", () => {
    expect(guestBookingSchema.safeParse(base).success).toBe(true);
    expect(guestBookingSchema.safeParse({ ...base, email: "invalid" }).success).toBe(false);
    expect(guestBookingSchema.safeParse({ ...base, policyAccepted: false }).success).toBe(false);
    expect(guestBookingSchema.safeParse({ ...base, phone: "call me" }).success).toBe(false);
  });
  it("requires a time-zone-qualified start", () => {
    expect(guestBookingSchema.safeParse({ ...base, start: "2027-03-15T10:00" }).success).toBe(
      false,
    );
  });
  it("bounds availability ranges", () => {
    expect(
      availabilitySchema.safeParse({ serviceSlug: "a", from: "2027-03-01", to: "2027-03-31" })
        .success,
    ).toBe(true);
    expect(
      availabilitySchema.safeParse({ serviceSlug: "a", from: "2027-03-01", to: "2027-05-01" })
        .success,
    ).toBe(false);
    expect(
      availabilitySchema.safeParse({ serviceSlug: "a", from: "2027-03-10", to: "2027-03-01" })
        .success,
    ).toBe(false);
  });
  it("accepts only 256-bit hex manage tokens, never references", () => {
    expect(guestTokenSchema.safeParse({ token: "a".repeat(64) }).success).toBe(true);
    expect(guestTokenSchema.safeParse({ token: "AVIV-123" }).success).toBe(false);
  });
});
