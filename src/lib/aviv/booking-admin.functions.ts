import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { bookingFilters, bookingActionSchema } from "./booking-admin-schema";
import { z } from "zod";
async function verify(client: SupabaseClient<Database>, id: string) {
  setResponseHeader("Cache-Control", "no-store");
  const user = await client.auth.getUser(getRequest().headers.get("authorization")?.slice(7));
  if (user.error || user.data.user?.id !== id) throw new Error("Please sign in again.");
  const role = await client.rpc("has_role", { _user_id: id, _role: "admin" });
  if (role.error || !role.data) throw new Error("Administrator access required.");
}
export const listAdminBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingFilters.parse(input))
  .handler(async ({ data, context }) => {
    await verify(context.supabase, context.userId);
    let query = context.supabase
      .from("bookings")
      .select(
        "id,public_reference,client_name,client_email,service_id,requested_start,confirmed_start,time_zone,payment_status,booking_status,session_status,created_at",
        { count: "exact" },
      );
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
    const [bookings, services] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .range((data.page - 1) * 20, data.page * 20 - 1),
      context.supabase.from("services").select("id,title"),
    ]);
    if (bookings.error || services.error) throw new Error("Bookings could not be loaded.");
    return { rows: bookings.data ?? [], total: bookings.count ?? 0, services: services.data ?? [] };
  });
export const getAdminBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await verify(context.supabase, context.userId);
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
    const service = booking.data
      ? await context.supabase
          .from("services")
          .select("title,duration_minutes")
          .eq("id", booking.data.service_id)
          .maybeSingle()
      : null;
    return { booking: booking.data, service: service?.data ?? null, audit: audit.data ?? [] };
  });
export const actOnBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await verify(context.supabase, context.userId);
    const result = await context.supabase.rpc("aviv_admin_booking_action", {
      _id: data.id,
      _action: data.action,
      _expected_updated_at: data.expectedUpdatedAt,
      ...(data.start ? { _start: data.start } : {}),
    });
    if (result.error) {
      const safe = [
        "Booking changed. Refresh and try again.",
        "Booking not found",
        "Choose a future appointment time",
        "This time overlaps another confirmed appointment",
        "Only paid active requests may be reviewed or scheduled",
        "Service duration is unavailable",
        "Appointment is already confirmed",
        "This booking cannot be cancelled",
        "A paid booking without a pending review is required",
        "Only a confirmed appointment that has ended may be completed",
      ];
      throw new Error(
        safe.includes(result.error.message)
          ? result.error.message
          : "The booking could not be updated. Refresh and try again.",
      );
    }
    return { saved: true };
  });
