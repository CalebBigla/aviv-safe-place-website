import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  actOnBooking,
  createBookingBlock,
  getAdminBooking,
  listAdminBookings,
  listBookingBlocks,
  removeBookingBlock,
} from "@/lib/aviv/booking-admin.functions";
import {
  bookingStatuses,
  queuePaymentStatuses,
  type BookingFilters,
} from "@/lib/aviv/booking-admin-schema";
import { formatNaira } from "@/lib/aviv/format";
import { AVIV_TIME_ZONE, LAGOS_OFFSET, addDays, isScheduledSlot } from "@/lib/aviv/schedule";

const label = (s: string) => s.replaceAll("_", " ");
function time(s: string | null) {
  return s
    ? new Date(s).toLocaleString("en-NG", {
        timeZone: AVIV_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
}
const scheduleHelp =
  "Mondays and Wednesdays: starts from 10:00 to 12:00. Saturdays: starts from 10:00 to 14:00. 30-minute steps, Lagos time.";
const defaultFilters: BookingFilters = { search: "", status: "all", payment: "all", page: 1 };

export function BookingLoading() {
  return (
    <div role="status" aria-label="Loading bookings" className="space-y-5">
      <Skeleton className="h-12 w-64" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function BookingTable({
  filters,
  onFilters,
}: {
  filters: BookingFilters;
  onFilters: (next: BookingFilters) => void;
}) {
  const read = useServerFn(listAdminBookings);
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["aviv-bookings", filters],
    queryFn: () => read({ data: filters }),
  });
  return (
    <div className="admin-content">
      <div className="eyebrow">Paid appointment requests</div>
      <h1 className="text-4xl mt-3 mb-3">Bookings</h1>
      <p className="text-sm text-muted-foreground mb-7">
        Bookings appear here once payment has been verified. Unpaid holds are not shown and release
        automatically.
      </p>
      <div className="grid sm:grid-cols-3 gap-4 mb-7">
        <Input
          aria-label="Search bookings"
          placeholder="Reference, name or email"
          value={filters.search}
          onChange={(e) => onFilters({ ...filters, search: e.target.value, page: 1 })}
        />
        <label className="text-sm">
          Booking status
          <select
            className="admin-select mt-2"
            value={filters.status}
            onChange={(e) =>
              onFilters({ ...filters, status: e.target.value as BookingFilters["status"], page: 1 })
            }
          >
            {["all", ...bookingStatuses].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Payment status
          <select
            className="admin-select mt-2"
            value={filters.payment}
            onChange={(e) =>
              onFilters({
                ...filters,
                payment: e.target.value as BookingFilters["payment"],
                page: 1,
              })
            }
          >
            {["all", ...queuePaymentStatuses].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isPending ? (
        <BookingLoading />
      ) : error ? (
        <div role="alert">
          <p>Bookings could not be loaded.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw />
            Try again
          </Button>
        </div>
      ) : (
        data && (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {data.total} matching bookings · Africa/Lagos (UTC+1)
            </p>
            {data.rows.length ? (
              <div className="overflow-x-auto border-y">
                <table className="w-full text-sm text-left min-w-[1050px]">
                  <caption className="sr-only">AVIV booking records</caption>
                  <thead>
                    <tr>
                      {[
                        "Reference",
                        "Client",
                        "Service",
                        "Requested",
                        "Confirmed",
                        "Payment",
                        "Booking",
                        "Created",
                      ].map((h) => (
                        <th className="p-3 border-b font-medium" key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((b) => (
                      <tr key={b.id} className="border-b">
                        <td className="p-3">
                          <Link
                            className="underline underline-offset-4"
                            to="/admin/bookings/$id"
                            params={{ id: b.id }}
                          >
                            {b.public_reference}
                          </Link>
                        </td>
                        <td className="p-3">
                          {b.client_name}
                          <span className="block text-xs text-muted-foreground">
                            {b.client_email}
                          </span>
                        </td>
                        <td className="p-3">
                          {b.service_title_snapshot ?? "—"}
                          {b.duration_minutes_snapshot && (
                            <span className="block text-xs text-muted-foreground">
                              {b.duration_minutes_snapshot} minutes
                            </span>
                          )}
                        </td>
                        <td className="p-3">{time(b.requested_start)}</td>
                        <td className="p-3">{time(b.confirmed_start)}</td>
                        <td className="p-3">{label(b.payment_status)}</td>
                        <td className="p-3">{label(b.booking_status)}</td>
                        <td className="p-3">{time(b.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                {filters.search || filters.status !== "all" || filters.payment !== "all"
                  ? "No bookings match these filters."
                  : "No paid bookings yet. Online payment is not connected, so bookings will appear here once it is."}
              </p>
            )}
            <div className="flex justify-between items-center mt-6">
              <Button
                variant="outline"
                disabled={filters.page === 1}
                onClick={() => onFilters({ ...filters, page: filters.page - 1 })}
              >
                <ChevronLeft />
                Previous
              </Button>
              <span className="text-sm">Page {filters.page}</span>
              <Button
                variant="outline"
                disabled={filters.page * 20 >= data.total}
                onClick={() => onFilters({ ...filters, page: filters.page + 1 })}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}

const actions = {
  review: {
    title: "Review paid request",
    description: "Mark this paid appointment request as reviewed.",
    icon: Check,
  },
  confirm: {
    title: "Confirm appointment",
    description:
      "Confirm a time in Africa/Lagos. Choosing a different time moves the appointment and revokes any existing session access; meeting details must be prepared again.",
    icon: CalendarDays,
  },
  propose: {
    title: "Propose alternative time",
    description:
      "Record an alternative time to agree with the client. The current time stays reserved until a new time is confirmed or the booking is cancelled. No email is sent.",
    icon: CalendarDays,
  },
  cancel: {
    title: "Cancel booking",
    description:
      "Cancel this appointment and release its time. The client's booking link will show it as cancelled. This does not issue a refund.",
    icon: Ban,
  },
  refund_review: {
    title: "Flag refund review",
    description:
      "Flag this paid booking for exceptional or statutory review. The published no-refund policy remains in place; no money is refunded.",
    icon: Flag,
  },
  complete: {
    title: "Mark session completed",
    description:
      "Record that the scheduled appointment has taken place. Only appointments whose scheduled end has passed may be completed.",
    icon: Check,
  },
} as const;
type Action = keyof typeof actions;

export function BookingDetail({ id }: { id: string }) {
  const read = useServerFn(getAdminBooking);
  const act = useServerFn(actOnBooking);
  const qc = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["aviv-booking", id],
    queryFn: () => read({ data: { id } }),
  });
  const [action, setAction] = useState<Action | null>(null);
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  if (isPending)
    return (
      <div className="admin-content">
        <BookingLoading />
      </div>
    );
  if (error)
    return (
      <div className="admin-content" role="alert">
        Booking could not be loaded.
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  const b = data?.booking;
  if (!b)
    return (
      <div className="admin-content">
        <h1>Booking not found</h1>
        <Link to="/admin/bookings" search={defaultFilters}>
          Return to bookings
        </Link>
      </div>
    );
  const paid = b.payment_status === "successful";
  const active = ["pending", "confirmed", "reschedule_requested"].includes(b.booking_status);
  const disabled = (a: Action) =>
    a === "cancel"
      ? !active
      : a === "complete"
        ? b.booking_status !== "confirmed" ||
          !b.confirmed_end ||
          new Date(b.confirmed_end) > new Date()
        : a === "refund_review"
          ? !paid || b.refund_status === "review_required"
          : !paid || !active;
  const needsTime = action === "confirm" || action === "propose";
  const chosen = start ? new Date(`${start}:00${LAGOS_OFFSET}`) : null;
  const offSchedule =
    chosen && b.duration_minutes_snapshot
      ? !isScheduledSlot(chosen, b.duration_minutes_snapshot)
      : false;
  return (
    <div className="admin-content">
      <Button variant="link" asChild className="px-0">
        <Link to="/admin/bookings" search={defaultFilters}>
          <ChevronLeft />
          Bookings
        </Link>
      </Button>
      <h1 className="text-4xl mt-4 mb-3 break-all">{b.public_reference}</h1>
      <p className="text-muted-foreground mb-8">
        {label(b.booking_status)} · {label(b.payment_status)}
      </p>
      {notice && (
        <p role="status" className="mb-6">
          {notice}
        </p>
      )}
      <dl className="grid sm:grid-cols-2 gap-6 border-y py-7">
        {[
          ["Client", b.client_name],
          ["Email", b.client_email],
          ["Phone", b.client_phone ?? "Not supplied"],
          ["Service", b.service_title_snapshot ?? "—"],
          [
            "Duration",
            b.duration_minutes_snapshot ? `${b.duration_minutes_snapshot} minutes` : "—",
          ],
          ["Price snapshot", formatNaira(b.price_minor)],
          ["Requested time", time(b.requested_start)],
          ["Alternative time", time(b.alternative_start)],
          ["Confirmed start", time(b.confirmed_start)],
          ["Confirmed end", time(b.confirmed_end)],
          ["Time zone", b.time_zone],
          ["Created", time(b.created_at)],
          ["Reviewed", time(b.reviewed_at)],
          ["Session status", label(b.session_status)],
          ["Refund administration", label(b.refund_status ?? "none")],
        ].map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground mb-2">{key}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-9">
        <h2 className="text-2xl mb-5">Appointment actions</h2>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(actions) as Action[]).map((a) => {
            const Icon = actions[a].icon;
            return (
              <Button
                variant="outline"
                key={a}
                disabled={disabled(a)}
                onClick={() => {
                  setAction(a);
                  setStart("");
                  setFailure("");
                }}
              >
                <Icon />
                {actions[a].title}
              </Button>
            );
          })}
        </div>
      </section>
      <section className="border-y py-7 mt-9">
        <h2 className="text-2xl mb-4">Session & notifications</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Video sessions and confirmation emails are not connected yet. Share appointment details
          with the client directly until they are.
        </p>
      </section>
      <section className="mt-9">
        <h2 className="text-2xl mb-5">Appointment history</h2>
        {data.audit.length ? (
          data.audit.map((a) => (
            <div className="border-b py-4" key={a.id}>
              <p>{label(a.action)}</p>
              <time className="text-xs text-muted-foreground">{time(a.created_at)}</time>
              {a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata) && (
                <p className="text-sm mt-2">
                  {typeof a.metadata["previous_start"] === "string" &&
                    `Previous time: ${time(a.metadata["previous_start"])}. `}
                  {typeof a.metadata["proposed_start"] === "string" &&
                    `New / proposed time: ${time(a.metadata["proposed_start"])}.`}
                </p>
              )}
            </div>
          ))
        ) : (
          <p className="empty-state">No appointment actions recorded yet.</p>
        )}
      </section>
      {action && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setAction(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actions[action].title}</DialogTitle>
              <DialogDescription>{actions[action].description}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-5"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setFailure("");
                try {
                  await act({
                    data: {
                      id: b.id,
                      action,
                      expectedUpdatedAt: b.updated_at,
                      ...(needsTime && chosen ? { start: chosen.toISOString() } : {}),
                    },
                  });
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ["aviv-booking", id] }),
                    qc.invalidateQueries({ queryKey: ["aviv-bookings"] }),
                    qc.invalidateQueries({ queryKey: ["aviv-admin-content"] }),
                  ]);
                  setAction(null);
                  setNotice("Appointment updated. No email was sent.");
                } catch (err) {
                  setFailure(err instanceof Error ? err.message : "Could not update appointment.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {needsTime && (
                <label className="block text-sm space-y-2">
                  <span>Appointment time — Africa/Lagos (UTC+1)</span>
                  <Input
                    aria-label="Appointment time"
                    aria-describedby="appointment-time-help"
                    type="datetime-local"
                    step={1800}
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                  <span id="appointment-time-help" className="block text-xs text-muted-foreground">
                    {b.duration_minutes_snapshot
                      ? `${b.duration_minutes_snapshot}-minute session. `
                      : ""}
                    {scheduleHelp}
                  </span>
                  {offSchedule && (
                    <span role="status" className="field-error block">
                      This time is outside the AVIV schedule.
                    </span>
                  )}
                </label>
              )}
              {failure && (
                <p role="alert" className="text-destructive text-sm">
                  {failure}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Go back
                </Button>
                <Button disabled={busy || (needsTime && offSchedule)} type="submit">
                  {busy ? "Saving…" : "Confirm action"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Weekly hours are fixed in the database; administrators add closures for exceptions.
export function AvailabilityAdmin() {
  const read = useServerFn(listBookingBlocks);
  const create = useServerFn(createBookingBlock);
  const remove = useServerFn(removeBookingBlock);
  const qc = useQueryClient();
  const blocks = useQuery({ queryKey: ["aviv-booking-blocks"], queryFn: () => read() });
  const [wholeDays, setWholeDays] = useState(true);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["aviv-booking-blocks"] }),
      qc.invalidateQueries({ queryKey: ["aviv-availability"] }),
    ]);
  // Whole days run from midnight on the first day to midnight after the last (Lagos time).
  const period = () =>
    wholeDays
      ? {
          start: `${from}T00:00:00${LAGOS_OFFSET}`,
          end: `${addDays(until || from, 1)}T00:00:00${LAGOS_OFFSET}`,
        }
      : { start: `${from}:00${LAGOS_OFFSET}`, end: `${until}:00${LAGOS_OFFSET}` };
  return (
    <div className="admin-content">
      <div className="eyebrow">Your safe place, thoughtfully managed</div>
      <h1 className="text-4xl mt-3 mb-7">Availability</h1>
      {notice && (
        <p role="status" className="mb-5 text-sm">
          {notice}
        </p>
      )}
      <section className="border-y py-7">
        <h2 className="text-2xl mb-4">Weekly hours</h2>
        <dl className="booking-summary border-0 py-0">
          <dt>Monday</dt>
          <dd>10:00 AM – 1:00 PM</dd>
          <dt>Wednesday</dt>
          <dd>10:00 AM – 1:00 PM</dd>
          <dt>Saturday</dt>
          <dd>10:00 AM – 3:00 PM</dd>
          <dt>Other days</dt>
          <dd>Closed</dd>
        </dl>
        <p className="text-sm text-muted-foreground mt-4">
          Africa/Lagos time. Sessions are 30 or 60 minutes on a 30-minute grid.
        </p>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl mb-2">Close a period</h2>
        <p className="text-sm text-muted-foreground mb-5">
          For holidays, leave or one-off unavailability. Guests won't be offered times in a closed
          period. A period that overlaps an existing booking or hold can't be closed until that
          booking is moved or cancelled.
        </p>
        <form
          className="space-y-5 max-w-xl"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFailure("");
            setNotice("");
            try {
              await create({ data: { ...period(), reason } });
              await refresh();
              setFrom("");
              setUntil("");
              setReason("");
              setNotice("Period closed.");
            } catch (err) {
              setFailure(err instanceof Error ? err.message : "The closure could not be saved.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <Switch
              id="whole-days"
              checked={wholeDays}
              onCheckedChange={(v) => {
                setWholeDays(v);
                setFrom("");
                setUntil("");
              }}
            />
            <label htmlFor="whole-days">Whole days</label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm space-y-2">
              <span>{wholeDays ? "First day" : "From"}</span>
              <Input
                type={wholeDays ? "date" : "datetime-local"}
                step={wholeDays ? undefined : 1800}
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm space-y-2">
              <span>{wholeDays ? "Last day (optional)" : "Until"}</span>
              <Input
                type={wholeDays ? "date" : "datetime-local"}
                step={wholeDays ? undefined : 1800}
                required={!wholeDays}
                min={from || undefined}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm space-y-2">
            <span>Internal note (optional, never shown to clients)</span>
            <Input maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {failure && (
            <p role="alert" className="text-destructive text-sm">
              {failure}
            </p>
          )}
          <Button disabled={busy}>
            <Plus />
            {busy ? "Saving…" : "Close period"}
          </Button>
        </form>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl mb-5">Upcoming closures</h2>
        {blocks.isPending ? (
          <BookingLoading />
        ) : blocks.error ? (
          <p role="alert">Closures could not be loaded.</p>
        ) : blocks.data.length ? (
          <div className="admin-list">
            {blocks.data.map((block) => (
              <div className="admin-row" key={block.id}>
                <div className="min-w-0">
                  <p className="font-medium">
                    {time(block.start)} – {time(block.end)}
                  </p>
                  {block.reason && (
                    <p className="text-xs text-muted-foreground mt-2">{block.reason}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Reopen ${time(block.start)} – ${time(block.end)}`}
                  onClick={async () => {
                    setNotice("");
                    try {
                      await remove({ data: { id: block.id } });
                      await refresh();
                      setNotice("Closure removed.");
                    } catch (err) {
                      setNotice(
                        err instanceof Error ? err.message : "The closure could not be removed.",
                      );
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No upcoming closures.</p>
        )}
      </section>
    </div>
  );
}
