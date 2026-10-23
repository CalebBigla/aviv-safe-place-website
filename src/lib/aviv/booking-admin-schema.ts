import { z } from "zod";

// Only paid bookings reach the administration queue; unpaid holds stay out of it.
export const bookingStatuses = [
  "pending",
  "confirmed",
  "reschedule_requested",
  "completed",
  "cancelled",
  "expired",
] as const;
export const queuePaymentStatuses = ["successful", "refunded"] as const;

// Invalid or outdated URL values fall back to defaults instead of breaking the page.
export const bookingFilters = z.object({
  search: z.string().max(150).catch("").default(""),
  status: z
    .enum(["all", ...bookingStatuses])
    .catch("all")
    .default("all"),
  payment: z
    .enum(["all", ...queuePaymentStatuses])
    .catch("all")
    .default("all"),
  page: z.coerce.number().int().min(1).max(100000).catch(1).default(1),
});
export const bookingActionSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["review", "confirm", "propose", "cancel", "refund_review", "complete"]),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    start: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    if (["confirm", "propose"].includes(value.action) && !value.start)
      ctx.addIssue({ code: "custom", path: ["start"], message: "Choose an appointment time." });
  });
export const blockSchema = z
  .object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(200).default(""),
  })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), {
    path: ["end"],
    message: "The end must be after the start.",
  });
export type BookingFilters = z.infer<typeof bookingFilters>;

// tstzrange text from PostgREST, e.g. ["2027-03-15 09:00:00+00","2027-03-15 10:00:00+00")
export function parsePeriod(period: string) {
  const match = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(period);
  if (!match) return null;
  const start = new Date(match[1]!.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  const end = new Date(match[2]!.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
}
