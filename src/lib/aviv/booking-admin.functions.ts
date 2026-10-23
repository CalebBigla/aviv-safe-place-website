import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  bookingFilters,
  bookingActionSchema,
  blockSchema,
  parsePeriod,
  queuePaymentStatuses,
} from "./booking-admin-schema";
import { requireAdmin } from "./admin-auth.server";
import { z } from "zod";

// Messages raised by the booking database functions that are safe to show administrators.
const safeMessages = new Set([
  "Booking changed. Refresh and try again.",
  "Booking not found",
  "Choose a future appointment time",
  "Choose a time within the AVIV schedule",
  "This time is blocked",
  "This time overlaps another confirmed appointment",
  "Only paid active requests may be reviewed or scheduled",
  "Service duration is unavailable",
  "Appointment is already confirmed",
  "This booking cannot be cancelled",
  "A paid booking without a pending review is required",
  "Only a confirmed appointment that has ended may be completed",
  "Choose a valid period",
  "Choose a period that ends in the future",
  "This period overlaps an existing booking or hold",
  "Period not found",
]);
const safeError = (message: string, fallback: string) =>
  new Error(safeMessages.has(message) ? message : fallback);

export const listAdminBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingFilters.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    let query = context.supabase
      .from("bookings")
      .select(
        "id,public_reference,client_name,client_email,service_id,service_title_snapshot,duration_minutes_snapshot,requested_start,confirmed_start,time_zone,payment_status,booking_status,session_status,created_at",
        { count: "exact" },
      )
      .in("payment_status", [...queuePaymentStatuses]);
    if (data.status !== "all") query = query.eq("booking_status", data.status);
    if (data.payment !== "all") query = query.eq("payment_status", data.payment);
    const search = data.search
      .replace(/[^\p{L}\p{N}@ ._-]/gu, "")
      .replace(/[%_]/g, "")
      .trim();
    if (search)
      query = query.or(
        `public_reference.ilike.%${search}%,client_name.ilike.%${search}%,client_email.ilike.%${search}%`,
      );
    const bookings = await query
      .order("created_at", { ascending: false })
      .range((data.page - 1) * 20, data.page * 20 - 1);
    if (bookings.error) throw new Error("Bookings could not be loaded.");
    return { rows: bookings.data ?? [], total: bookings.count ?? 0 };
  });

export const getAdminBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const [booking, audit] = await Promise.all([
      context.supabase.from("bookings").select("*").eq("id", data.id).maybeSingle(),
      context.supabase
        .from("audit_logs")
        .select("id,action,created_at,metadata")
        .eq("resource_type", "bookings")
        .eq("resource_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (booking.error || audit.error) throw new Error("Booking details could not be loaded.");
    return { booking: booking.data, audit: audit.data ?? [] };
  });

export const actOnBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const result = await context.supabase.rpc("aviv_admin_booking_action", {
      _id: data.id,
      _action: data.action,
      _expected_updated_at: data.expectedUpdatedAt,
      ...(data.start ? { _start: data.start } : {}),
    });
    if (result.error)
      throw safeError(
        result.error.message,
        "The booking could not be updated. Refresh and try again.",
      );
    return { saved: true };
  });

export const listBookingBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const result = await context.supabase
      .from("booking_blocks")
      .select("id,period,reason")
      .order("period")
      .limit(500);
    if (result.error) throw new Error("Closures could not be loaded.");
    const now = Date.now();
    return (result.data ?? []).flatMap((row) => {
      const period = parsePeriod(row.period);
      return period && period.end.getTime() > now
        ? [
            {
              id: row.id,
              reason: row.reason,
              start: period.start.toISOString(),
              end: period.end.toISOString(),
            },
          ]
        : [];
    });
  });

export const createBookingBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => blockSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const result = await context.supabase.rpc("aviv_admin_block_period", {
      _start: data.start,
      _end: data.end,
      _reason: data.reason,
    });
    if (result.error) throw safeError(result.error.message, "The closure could not be saved.");
    return { saved: true };
  });

export const removeBookingBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const result = await context.supabase.rpc("aviv_admin_unblock_period", { _id: data.id });
    if (result.error) throw safeError(result.error.message, "The closure could not be removed.");
    return { saved: true };
  });
