import { describe, expect, it } from "vitest";
import {
  blockSchema,
  bookingActionSchema,
  bookingFilters,
  parsePeriod,
} from "@/lib/aviv/booking-admin-schema";

describe("Booking administration validation", () => {
  const action = {
    id: "12345678-1234-4234-8234-123456789abc",
    action: "confirm",
    expectedUpdatedAt: "2026-10-13T10:00:00Z",
  };
  it("defaults filters and falls back safely for outdated or invalid URLs", () => {
    expect(bookingFilters.parse({})).toEqual({
      search: "",
      status: "all",
      payment: "all",
      page: 1,
    });
    expect(bookingFilters.parse({ page: 0, payment: "pending", status: "paid" })).toEqual({
      search: "",
      status: "all",
      payment: "all",
      page: 1,
    });
    expect(
      bookingFilters.parse({ status: "expired", payment: "refunded", page: "3" }),
    ).toMatchObject({
      status: "expired",
      payment: "refunded",
      page: 3,
    });
  });
  it("requires timezone-aware scheduling and known actions", () => {
    expect(bookingActionSchema.safeParse(action).success).toBe(false);
    expect(
      bookingActionSchema.safeParse({ ...action, start: "2026-10-16T10:00:00+01:00" }).success,
    ).toBe(true);
    expect(bookingActionSchema.safeParse({ ...action, start: "2026-10-16T10:00:00" }).success).toBe(
      false,
    );
    expect(bookingActionSchema.safeParse({ ...action, action: "mark_paid" }).success).toBe(false);
  });
  it("requires closures to end after they start", () => {
    expect(
      blockSchema.safeParse({
        start: "2027-03-15T00:00:00+01:00",
        end: "2027-03-16T00:00:00+01:00",
      }).success,
    ).toBe(true);
    expect(
      blockSchema.safeParse({
        start: "2027-03-15T10:00:00+01:00",
        end: "2027-03-15T10:00:00+01:00",
      }).success,
    ).toBe(false);
  });
  it("reads closure ranges as returned by PostgreSQL", () => {
    expect(parsePeriod('["2027-03-15 09:00:00+00","2027-03-15 10:30:00+00")')).toEqual({
      start: new Date("2027-03-15T09:00:00Z"),
      end: new Date("2027-03-15T10:30:00Z"),
    });
    expect(parsePeriod('["2027-03-14 23:00:00.5+00","2027-03-16 23:00:00+00")')?.end).toEqual(
      new Date("2027-03-16T23:00:00Z"),
    );
    expect(parsePeriod("empty")).toBeNull();
  });
});
