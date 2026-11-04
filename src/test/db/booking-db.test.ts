// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asRole, resetTestDatabase, testDatabaseUrl, type Sql } from "./harness";

// Business rules and security boundaries enforced by the database itself.
// Run with: AVIV_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm test
const suite = testDatabaseUrl ? describe : describe.skip;

const rawToken = () => randomBytes(32).toString("hex");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

suite("AVIV booking database", () => {
  let url = "";
  let sql: Sql;
  let admin = "";
  let member = "";
  // Lagos calendar dates two weeks ahead (date_trunc('week') is Monday). Tests share one
  // database, so each claims distinct slots; the lifecycle test uses the following week.
  let sat2 = "";
  let mon = "";
  let tue = "";
  let wed = "";
  let thu = "";
  let fri = "";
  let sat = "";
  let sun = "";
  const at = (day: string, time: string) => `${day} ${time}:00+01`;
  let client = 0;

  const createHold = (
    slug: string,
    start: string,
    email = `guest${++client}@example.org`,
    hash = sha256(rawToken()),
  ) =>
    asRole(sql, "service_role", null, (tx) =>
      tx`SELECT public.aviv_create_guest_request(${slug}, 'Guest Client', ${email}, '', ${start}::timestamptz, ${hash}) AS r`.then(
        ([row]) =>
          row?.["r"] as { reference: string; start: string; end: string; hold_expires_at: string },
      ),
    );
  const readGuest = (hash: string, key = "ip:test") =>
    asRole(sql, "service_role", null, (tx) =>
      tx`SELECT public.aviv_read_guest_booking(${hash}, ${key}) AS r`.then(
        ([row]) => row?.["r"] as Record<string, unknown> | null,
      ),
    );
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => "resolved",
      (error: Error) => error.message,
    );
  // updated_at is read as text: JS Dates drop the microseconds the optimistic lock compares.
  const bookingByReference = async (reference: string) =>
    (
      await sql`SELECT *, updated_at::text AS version FROM public.bookings WHERE public_reference=${reference}`
    )[0]!;
  const markPaid = (reference: string) =>
    sql`UPDATE public.bookings SET payment_status='successful' WHERE public_reference=${reference} RETURNING id, updated_at::text AS updated_at`.then(
      ([row]) => row as { id: string; updated_at: string },
    );
  const adminAction = (
    id: string,
    action: string,
    expected: string,
    start?: string,
    actor = admin,
  ) =>
    asRole(
      sql,
      "authenticated",
      actor,
      (tx) =>
        tx`SELECT public.aviv_admin_booking_action(${id}::uuid, ${action}, ${expected}::text::timestamptz, ${start ?? null}::timestamptz)`,
    );

  beforeAll(async () => {
    url = await resetTestDatabase();
    sql = postgres(url, { max: 4, onnotice: () => {} });
    [admin, member] = [randomUUID(), randomUUID()];
    await sql`INSERT INTO auth.users(id,email) VALUES (${admin},'admin@example.org'), (${member},'member@example.org')`;
    await sql`INSERT INTO public.user_roles(user_id,role) VALUES (${admin},'admin')`;
    await sql`INSERT INTO public.services(slug,title,duration_minutes,price_minor,active,published)
      VALUES ('session-60','Individual session',60,2500000,true,true), ('session-30','Check-in',30,1500000,true,true)`;
    const [row] =
      await sql`SELECT to_char(m,'YYYY-MM-DD') mon FROM (SELECT (date_trunc('week', now() AT TIME ZONE 'Africa/Lagos') + interval '14 days')::date m) x`;
    const day = (offset: number) => {
      const d = new Date(`${row!["mon"]}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    [mon, tue, wed, thu, fri, sat, sun, sat2] = [0, 1, 2, 3, 4, 5, 6, 12].map(day) as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
  }, 120000);
  afterAll(async () => {
    await sql?.end();
  });

  describe("schedule and durations", () => {
    const valid = async (start: string, minutes: number) =>
      (await sql`SELECT public.aviv_slot_valid(${start}::timestamptz, ${minutes}) AS v`)[0]![
        "v"
      ] as boolean;

    it("opens Monday, Wednesday and Saturday only", async () => {
      for (const day of [mon, wed, sat]) expect(await valid(at(day, "10:00"), 30)).toBe(true);
      for (const day of [tue, thu, fri, sun]) expect(await valid(at(day, "10:00"), 30)).toBe(false);
    });
    it("accepts only 30 and 60 minute sessions", async () => {
      expect(await valid(at(mon, "10:00"), 30)).toBe(true);
      expect(await valid(at(mon, "10:00"), 60)).toBe(true);
      for (const minutes of [15, 45, 90, 120])
        expect(await valid(at(mon, "10:00"), minutes)).toBe(false);
      await expect(
        sql`UPDATE public.services SET duration_minutes=45 WHERE slug='session-30'`,
      ).rejects.toThrow();
    });
    it("applies opening, closing and grid boundaries", async () => {
      expect(await valid(at(mon, "09:30"), 30)).toBe(false);
      expect(await valid(at(mon, "10:15"), 30)).toBe(false);
      expect(await valid(at(mon, "12:00"), 60)).toBe(true);
      expect(await valid(at(mon, "12:30"), 30)).toBe(false);
      expect(await valid(at(mon, "12:30"), 60)).toBe(false);
      expect(await valid(at(sat, "14:00"), 60)).toBe(true);
      expect(await valid(at(sat, "14:30"), 60)).toBe(false);
      expect(await valid(at(sat, "14:30"), 30)).toBe(false);
    });
    it("evaluates times in Africa/Lagos regardless of the session time zone", async () => {
      await sql`SET TIME ZONE 'America/New_York'`;
      expect(await valid(`${mon}T09:00:00Z`, 30)).toBe(true); // 10:00 in Lagos
      expect(await valid(`${mon}T10:00:00-05:00`, 30)).toBe(false); // 16:00 in Lagos
      await sql`RESET TIME ZONE`;
    });
    it("lists the exact AVIV start times", async () => {
      const starts = async (day: string, minutes: number) =>
        (
          await sql`SELECT to_char(slot_start AT TIME ZONE 'Africa/Lagos','HH24:MI') s FROM public.aviv_slot_availability(${day}::date, ${day}::date, ${minutes})`
        ).map((r) => r["s"]);
      expect(await starts(mon, 30)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
      expect(await starts(wed, 60)).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00"]);
      expect(await starts(sat, 60)).toEqual([
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
      expect(await starts(tue, 30)).toEqual([]);
      expect(await starts(sun, 60)).toEqual([]);
    });
  });

  describe("past times", () => {
    it("marks past slots unavailable and refuses to hold them", async () => {
      const past =
        await sql`SELECT bool_and(NOT available AND reason='past') ok FROM public.aviv_slot_availability((now() - interval '14 days')::date, (now() - interval '8 days')::date, 30)`;
      expect(past[0]!["ok"]).toBe(true);
      const [{ d }] =
        (await sql`SELECT to_char(d,'YYYY-MM-DD') d FROM generate_series(current_date - 13, current_date - 7, interval '1 day') d WHERE extract(isodow FROM d)=1`) as unknown as [
          { d: string },
        ];
      expect(await failure(createHold("session-30", at(d, "10:00")))).toBe("AVIV_SLOT_PAST");
    });
    it("rejects off-schedule and invalid requests", async () => {
      expect(await failure(createHold("session-30", at(tue, "10:00")))).toBe(
        "AVIV_SLOT_OUTSIDE_SCHEDULE",
      );
      expect(await failure(createHold("session-60", at(mon, "12:30")))).toBe(
        "AVIV_SLOT_OUTSIDE_SCHEDULE",
      );
      expect(await failure(createHold("unknown", at(mon, "10:00")))).toBe(
        "AVIV_SERVICE_UNAVAILABLE",
      );
      expect(await failure(createHold("session-30", at(mon, "10:00"), "not-an-email"))).toBe(
        "AVIV_INVALID_DETAILS",
      );
    });
  });

  describe("holds and overlap", () => {
    it("holds a slot for 30 minutes and blocks it for other guests", async () => {
      const hold = await createHold("session-60", at(wed, "10:00"));
      const minutes = (Date.parse(hold.hold_expires_at) - Date.now()) / 60000;
      expect(minutes).toBeGreaterThan(29);
      expect(minutes).toBeLessThanOrEqual(30);
      expect(await failure(createHold("session-30", at(wed, "10:30")))).toBe(
        "AVIV_SLOT_UNAVAILABLE",
      );
      expect(await failure(createHold("session-60", at(wed, "10:00")))).toBe(
        "AVIV_SLOT_UNAVAILABLE",
      );
      const slots =
        await sql`SELECT to_char(slot_start AT TIME ZONE 'Africa/Lagos','HH24:MI') s, available FROM public.aviv_slot_availability(${wed}::date, ${wed}::date, 30)`;
      expect(slots.filter((s) => !s["available"]).map((s) => s["s"])).toEqual(["10:00", "10:30"]);
    });
    it("allows adjacent sessions", async () => {
      await createHold("session-30", at(wed, "11:00"));
      await createHold("session-30", at(wed, "11:30"));
    });
    it("lets exactly one of two concurrent attempts claim a slot", async () => {
      const [a, b] = [postgres(url, { max: 1 }), postgres(url, { max: 1 })];
      const attempt = (conn: Sql, n: number) =>
        asRole(
          conn,
          "service_role",
          null,
          (tx) =>
            tx`SELECT public.aviv_create_guest_request('session-60','Guest',${`race${n}@example.org`},'',${at(sat, "13:00")}::timestamptz,${sha256(rawToken())})`,
        );
      const results = await Promise.allSettled([attempt(a, 1), attempt(b, 2)]);
      await Promise.all([a.end(), b.end()]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message,
      ).toBe("AVIV_SLOT_UNAVAILABLE");
    });
    it("enforces no-overlap in the table even when the booking functions are bypassed", async () => {
      const [service] = await sql`SELECT id FROM public.services WHERE slug='session-60'`;
      await expect(
        sql`INSERT INTO public.bookings(public_reference,client_name,client_email,service_id,price_minor,slot)
            VALUES ('AVIV-direct','Direct','direct@example.org',${service!["id"]},1,tstzrange(${at(sat, "13:30")}::timestamptz, ${at(sat, "14:30")}::timestamptz))`,
      ).rejects.toThrow(/bookings_no_overlap/);
    });
    it("releases a slot once its hold expires", async () => {
      const first = await createHold("session-30", at(sat, "10:00"));
      await sql`UPDATE public.bookings SET request_expires_at=now() - interval '1 second' WHERE public_reference=${first.reference}`;
      const [slot] =
        await sql`SELECT available FROM public.aviv_slot_availability(${sat}::date, ${sat}::date, 30) WHERE slot_start=${at(sat, "10:00")}::timestamptz`;
      expect(slot!["available"]).toBe(true);
      await createHold("session-30", at(sat, "10:00"));
      const lapsed = await bookingByReference(first.reference);
      expect(lapsed["booking_status"]).toBe("expired");
      expect(lapsed["slot"]).toBeNull();
    });
    it("limits each email to two active holds", async () => {
      await createHold("session-30", at(sat, "11:00"), "busy@example.org");
      await createHold("session-30", at(sat, "11:30"), "busy@example.org");
      expect(await failure(createHold("session-30", at(sat, "12:00"), "busy@example.org"))).toBe(
        "AVIV_TOO_MANY_HOLDS",
      );
    });
  });

  describe("blocked periods", () => {
    const block = (start: string, end: string, actor: string) =>
      asRole(
        sql,
        "authenticated",
        actor,
        (tx) =>
          tx`SELECT public.aviv_admin_block_period(${start}::timestamptz, ${end}::timestamptz, 'Leave') AS id`,
      );

    it("blocks availability and new holds, admin only", async () => {
      expect(await failure(block(at(mon, "10:00"), at(mon, "11:00"), member))).toMatch(
        /Administrator access required/,
      );
      await block(at(mon, "10:00"), at(mon, "11:00"), admin);
      const slots =
        await sql`SELECT to_char(slot_start AT TIME ZONE 'Africa/Lagos','HH24:MI') s, reason FROM public.aviv_slot_availability(${mon}::date, ${mon}::date, 60)`;
      expect(slots.filter((s) => s["reason"] === "blocked").map((s) => s["s"])).toEqual([
        "10:00",
        "10:30",
      ]);
      expect(await failure(createHold("session-30", at(mon, "10:30")))).toBe(
        "AVIV_SLOT_UNAVAILABLE",
      );
      await createHold("session-30", at(mon, "11:00"));
    });
    it("refuses to block over an existing hold", async () => {
      expect(await failure(block(at(mon, "11:00"), at(mon, "12:00"), admin))).toBe(
        "This period overlaps an existing booking or hold",
      );
    });
  });

  describe("guest manage tokens", () => {
    it("stores only the hash and projects no identity", async () => {
      const raw = rawToken();
      const hold = await createHold(
        "session-60",
        at(wed, "12:00"),
        "private@example.org",
        sha256(raw),
      );
      const stored =
        await sql`SELECT t.* FROM public.booking_access_tokens t JOIN public.bookings b ON b.id=t.booking_id WHERE b.public_reference=${hold.reference}`;
      expect(stored[0]!["token_hash"]).toBe(sha256(raw));
      expect(JSON.stringify(stored)).not.toContain(raw);
      const view = await readGuest(sha256(raw));
      expect(view?.["reference"]).toBe(hold.reference);
      expect(view?.["booking_status"]).toBe("pending");
      expect(view?.["duration_minutes"]).toBe(60);
      expect(Object.keys(view ?? {})).not.toEqual(expect.arrayContaining(["client_name"]));
      expect(JSON.stringify(view)).not.toMatch(/private@example\.org|Guest Client|"id"/);
    });
    it("fails safely for unknown, expired and revoked tokens", async () => {
      expect(await readGuest(sha256(rawToken()))).toBeNull();
      expect(await readGuest("not-a-hash")).toBeNull();
      const [expiredRaw, revokedRaw] = [rawToken(), rawToken()];
      const expired = await createHold(
        "session-30",
        at(sat, "12:30"),
        undefined,
        sha256(expiredRaw),
      );
      await createHold("session-30", at(sat, "12:00"), undefined, sha256(revokedRaw));
      expect(expired.reference).toMatch(/^AVIV-[a-f0-9]{32}$/);
      await sql`UPDATE public.booking_access_tokens SET expires_at=now() - interval '1 second' WHERE token_hash=${sha256(expiredRaw)}`;
      await sql`UPDATE public.booking_access_tokens SET revoked_at=now() WHERE token_hash=${sha256(revokedRaw)}`;
      expect(await readGuest(sha256(expiredRaw))).toBeNull();
      expect(await readGuest(sha256(revokedRaw))).toBeNull();
    });
    it("shows an expired hold as expired rather than hiding it", async () => {
      const raw = rawToken();
      const hold = await createHold("session-30", at(sat, "14:00"), undefined, sha256(raw));
      await sql`UPDATE public.bookings SET request_expires_at=now() - interval '1 second' WHERE public_reference=${hold.reference}`;
      expect((await readGuest(sha256(raw)))?.["booking_status"]).toBe("expired");
    });
    it("throttles repeated misses per client without punishing normal reads", async () => {
      const raw = rawToken();
      await createHold("session-30", at(mon, "11:30"), undefined, sha256(raw));
      for (let i = 0; i < 30; i++)
        expect(await readGuest(sha256(raw), "ip:refresher")).not.toHaveProperty("rate_limited");
      for (let i = 0; i < 20; i++) await readGuest(sha256(rawToken()), "ip:guesser");
      expect(await readGuest(sha256(raw), "ip:guesser")).toEqual({ rate_limited: true });
      expect(await readGuest(sha256(raw), "ip:someone-else")).not.toHaveProperty("rate_limited");
    });
  });

  describe("authorisation", () => {
    it("keeps booking, payment and token tables closed to browser roles", async () => {
      const [service] = await sql`SELECT id FROM public.services LIMIT 1`;
      for (const role of ["anon", "authenticated"] as const) {
        expect(
          await failure(
            asRole(
              sql,
              role,
              role === "authenticated" ? member : null,
              (tx) =>
                tx`INSERT INTO public.bookings(public_reference,client_name,client_email,service_id,price_minor) VALUES ('AVIV-x','x','x@example.org',${service!["id"]},1)`,
            ),
          ),
        ).toMatch(/permission denied/);
        for (const table of [
          "booking_access_tokens",
          "payment_events",
          "rate_limit_buckets",
          "booking_blocks",
          "user_roles",
          "services",
        ])
          expect(
            await failure(
              asRole(sql, role, null, (tx) => tx.unsafe(`TRUNCATE public.${table} CASCADE`)),
            ),
          ).toMatch(/permission denied/);
        for (const table of [
          "booking_access_tokens",
          "payment_events",
          "rate_limit_buckets",
          "booking_blocks",
          "user_roles",
        ])
          expect(
            await failure(
              asRole(sql, role, null, (tx) => tx.unsafe(`DELETE FROM public.${table}`)),
            ),
          ).toMatch(/permission denied/);
        expect(
          await failure(
            asRole(
              sql,
              role,
              member,
              (tx) => tx`INSERT INTO public.user_roles(user_id,role) VALUES (${member},'admin')`,
            ),
          ),
        ).toMatch(/permission denied/);
        expect(
          await failure(
            asRole(sql, role, null, (tx) => tx`SELECT * FROM public.booking_access_tokens`),
          ),
        ).toMatch(/permission denied/);
      }
      const visible = await asRole(
        sql,
        "authenticated",
        member,
        (tx) => tx`SELECT count(*)::int n FROM public.bookings`,
      );
      expect(visible[0]!["n"]).toBe(0);
      const adminVisible = await asRole(
        sql,
        "authenticated",
        admin,
        (tx) => tx`SELECT count(*)::int n FROM public.bookings`,
      );
      expect(adminVisible[0]!["n"]).toBeGreaterThan(0);
    });
    it("keeps server-only functions server-only", async () => {
      for (const role of ["anon", "authenticated"] as const)
        for (const call of [
          `SELECT public.aviv_create_guest_request('session-30','x','x@example.org','',now(),'${"a".repeat(64)}')`,
          `SELECT public.aviv_read_guest_booking('${"a".repeat(64)}','k')`,
          `SELECT public.aviv_consume_rate_limit('k',1,60)`,
          `SELECT public.aviv_expire_stale_holds()`,
          `SELECT public.aviv_submit_contact('n','a@b.co','s','m','bucket1','bucket2')`,
          `SELECT count(*) FROM public.aviv_slot_availability('${sat}'::date,'${sat}'::date,30)`,
        ])
          expect(await failure(asRole(sql, role, member, (tx) => tx.unsafe(call)))).toMatch(
            /permission denied/,
          );
      const open = await asRole(
        sql,
        "service_role",
        null,
        (tx) =>
          tx`SELECT count(*)::int n FROM public.aviv_slot_availability(${sat}::date, ${sat}::date, 30)`,
      );
      expect(open[0]!["n"]).toBe(9);
      const contact = await asRole(
        sql,
        "service_role",
        null,
        (tx) => tx`SELECT public.aviv_submit_contact('n','a@b.co','s','m','c:ip','c:email') AS r`,
      );
      expect(contact[0]!["r"]).toEqual({ ok: true });
    });
    it("gives administrators no rights without two-factor, even with the right password", async () => {
      const hold = await createHold("session-30", at(sat2, "11:30"));
      const paid = await markPaid(hold.reference);
      const withoutCode = <T>(fn: (tx: Sql) => Promise<T>) =>
        asRole(sql, "authenticated", admin, fn, "aal1");
      const visible = await withoutCode((tx) => tx`SELECT count(*)::int n FROM public.bookings`);
      expect(visible[0]!["n"]).toBe(0);
      const role = await withoutCode(
        (tx) => tx`SELECT public.has_role(${admin}::uuid,'admin') AS ok`,
      );
      expect(role[0]!["ok"]).toBe(false);
      expect(
        await failure(
          withoutCode(
            (tx) =>
              tx`SELECT public.aviv_admin_booking_action(${paid.id}::uuid,'cancel',${paid.updated_at}::text::timestamptz)`,
          ),
        ),
      ).toMatch(/Administrator access required/);
      expect(
        await failure(
          withoutCode((tx) => tx`SELECT public.aviv_admin_session_access(${paid.id}::uuid)`),
        ),
      ).toMatch(/Administrator access required/);
      const withCode = await asRole(
        sql,
        "authenticated",
        admin,
        (tx) => tx`SELECT public.has_role(${admin}::uuid,'admin') AS ok`,
      );
      expect(withCode[0]!["ok"]).toBe(true);
      await sql`UPDATE public.bookings SET booking_status='cancelled', slot=NULL WHERE id=${paid.id}`;
    });
    it("refuses admin booking actions for guests and non-admins", async () => {
      const hold = await createHold("session-60", at(mon, "12:00"));
      const paid = await markPaid(hold.reference);
      expect(
        await failure(
          asRole(
            sql,
            "anon",
            null,
            (tx) =>
              tx`SELECT public.aviv_admin_booking_action(${paid.id}::uuid,'cancel',${paid.updated_at}::text::timestamptz)`,
          ),
        ),
      ).toMatch(/permission denied/);
      expect(
        await failure(adminAction(paid.id, "cancel", paid.updated_at, undefined, member)),
      ).toMatch(/Administrator access required/);
      const deactivated = randomUUID();
      await sql`INSERT INTO auth.users(id) VALUES (${deactivated})`;
      await sql`INSERT INTO public.user_roles(user_id,role) VALUES (${deactivated},'admin')`;
      await sql`UPDATE public.profiles SET active=false WHERE id=${deactivated}`;
      expect(
        await failure(adminAction(paid.id, "cancel", paid.updated_at, undefined, deactivated)),
      ).toMatch(/Administrator access required/);
    });
  });

  describe("admin lifecycle and snapshots", () => {
    it("schedules paid bookings on valid, free times using the booking's own duration", async () => {
      const hold = await createHold("session-60", at(sat2, "10:00"));
      const unpaid = await bookingByReference(hold.reference);
      expect(await failure(adminAction(unpaid["id"], "review", unpaid["version"]))).toBe(
        "Only paid active requests may be reviewed or scheduled",
      );
      let b = await markPaid(hold.reference);
      // Editing the service later must not change this booking.
      await sql`UPDATE public.services SET duration_minutes=30, price_minor=100 WHERE slug='session-60'`;
      expect(await failure(adminAction(b.id, "confirm", b.updated_at, at(tue, "10:00")))).toBe(
        "Choose a time within the AVIV schedule",
      );
      expect(await failure(adminAction(b.id, "confirm", b.updated_at, at(wed, "10:30")))).toBe(
        "This time overlaps another confirmed appointment",
      );
      await adminAction(b.id, "confirm", b.updated_at, at(sat2, "14:00"));
      let row = await bookingByReference(hold.reference);
      expect(row["booking_status"]).toBe("confirmed");
      expect(row["duration_minutes_snapshot"]).toBe(60);
      expect(Number(row["price_minor"])).toBe(2500000);
      expect(
        new Date(row["confirmed_end"]).getTime() - new Date(row["confirmed_start"]).getTime(),
      ).toBe(3600000);
      await expect(sql`UPDATE public.bookings SET price_minor=1 WHERE id=${b.id}`).rejects.toThrow(
        /immutable/,
      );
      await expect(
        sql`UPDATE public.bookings SET duration_minutes_snapshot=30 WHERE id=${b.id}`,
      ).rejects.toThrow(/immutable/);
      // Stale optimistic timestamps are rejected.
      expect(await failure(adminAction(b.id, "cancel", b.updated_at))).toBe(
        "Booking changed. Refresh and try again.",
      );
      // Rescheduling moves the claim and revokes session access but keeps the guest's manage link.
      const session = sha256(rawToken());
      await sql`INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES (${b.id},${session},'session',now()+interval '1 day')`;
      await adminAction(b.id, "confirm", row["version"], at(sat2, "12:00"));
      row = await bookingByReference(hold.reference);
      expect(new Date(row["confirmed_start"]).toISOString()).toBe(
        new Date(at(sat2, "12:00")).toISOString(),
      );
      const [revoked] =
        await sql`SELECT revoked_at FROM public.booking_access_tokens WHERE token_hash=${session}`;
      expect(revoked!["revoked_at"]).not.toBeNull();
      await adminAction(b.id, "cancel", row["version"]);
      row = await bookingByReference(hold.reference);
      expect(row["booking_status"]).toBe("cancelled");
      expect(row["slot"]).toBeNull();
      const [manage] =
        await sql`SELECT revoked_at FROM public.booking_access_tokens WHERE booking_id=${b.id} AND purpose='manage'`;
      expect(manage!["revoked_at"]).toBeNull();
      b = { id: b.id, updated_at: row["version"] };
      expect(await failure(adminAction(b.id, "cancel", b.updated_at))).toBe(
        "This booking cannot be cancelled",
      );
      await sql`UPDATE public.services SET duration_minutes=60, price_minor=2500000 WHERE slug='session-60'`;
    });
  });

  describe("video sessions", () => {
    // Puts a booking at a chosen time relative to now, which the weekly schedule wouldn't allow.
    const appointment = async (
      startsIn: string,
      client = `session${++clientCount}@example.org`,
    ) => {
      const manage = rawToken();
      const hold = await createHold("session-30", at(sat2, "11:00"), client, sha256(manage));
      await sql`UPDATE public.bookings SET payment_status='successful', booking_status='confirmed', slot=NULL,
        confirmed_start=now()+${startsIn}::interval, confirmed_end=now()+${startsIn}::interval+interval '30 minutes' WHERE public_reference=${hold.reference}`;
      return {
        manage,
        reference: hold.reference,
        booking: await bookingByReference(hold.reference),
      };
    };
    let clientCount = 0;
    const issue = (manage: string, session = rawToken(), key = `ip:session${++clientCount}`) =>
      asRole(sql, "service_role", null, (tx) =>
        tx`SELECT public.aviv_issue_session_link(${sha256(manage)}, ${sha256(session)}, ${key}) AS r`.then(
          ([row]) => row?.["r"] as Record<string, unknown>,
        ),
      ).then((result) => ({ session, result }));
    const access = (session: string, key = `ip:session${++clientCount}`) =>
      asRole(sql, "service_role", null, (tx) =>
        tx`SELECT public.aviv_read_session_access(${sha256(session)}, ${key}) AS r`.then(
          ([row]) => row?.["r"] as Record<string, unknown>,
        ),
      );
    const adminAccess = (id: string, actor: string) =>
      asRole(sql, "authenticated", actor, (tx) =>
        tx`SELECT public.aviv_admin_session_access(${id}::uuid) AS r`.then(
          ([row]) => row?.["r"] as Record<string, unknown>,
        ),
      );

    it("keeps the room closed until 15 minutes before the start", async () => {
      const { manage, reference } = await appointment("16 minutes");
      const { result } = await issue(manage);
      expect(result["state"]).toBe("early");
      expect(result).toHaveProperty("opens_at");
      const row = await bookingByReference(reference);
      expect(row["meeting_room_id"]).toBeNull();
      const tokens =
        await sql`SELECT 1 FROM public.booking_access_tokens WHERE booking_id=${row["id"]} AND purpose='session'`;
      expect(tokens).toHaveLength(0);
    });
    it("opens one private room, storing only the session link's hash", async () => {
      const { manage, reference, booking } = await appointment("10 minutes");
      const { session, result } = await issue(manage);
      expect(result).toEqual({ state: "open" });
      const room = await access(session);
      expect(room["state"]).toBe("open");
      expect(room["room"]).toMatch(/^aviv-[a-f0-9]{32}$/);
      expect(JSON.stringify(room)).not.toMatch(/Guest Client|example\.org/);
      const row = await bookingByReference(reference);
      expect(row["meeting_room_id"]).toBe(room["room"]);
      expect(row["meeting_provider"]).toBe("agora");
      expect(row["session_status"]).toBe("ready");
      expect(row["meeting_link_issued_at"]).not.toBeNull();
      const [stored] =
        await sql`SELECT * FROM public.booking_access_tokens WHERE booking_id=${booking["id"]} AND purpose='session'`;
      expect(stored!["token_hash"]).toBe(sha256(session));
      expect(JSON.stringify(stored)).not.toContain(session);
      // Renewing does not touch the booking, so it can't disturb an administrator's optimistic lock.
      await access(session);
      expect((await bookingByReference(reference))["version"]).toBe(row["version"]);
      // The administrator enters the same room.
      expect((await adminAccess(booking["id"], admin))["room"]).toBe(room["room"]);
    });
    it("keeps manage links and session links separate, and new links don't break earlier ones", async () => {
      const { manage } = await appointment("0 minutes");
      expect((await access(manage))["state"]).toBe("unavailable");
      const first = await issue(manage);
      expect((await issue(first.session)).result["state"]).toBe("unavailable");
      const second = await issue(manage);
      expect((await access(first.session))["state"]).toBe("open");
      expect((await access(second.session))["state"]).toBe("open");
    });
    describe("emailed confirmation links", () => {
      const emailLink = (id: string, session = rawToken(), actor = admin) =>
        asRole(sql, "authenticated", actor, (tx) =>
          tx`SELECT public.aviv_admin_confirmation_link(${id}::uuid, ${sha256(session)}) AS r`.then(
            ([row]) => row?.["r"] as Record<string, unknown>,
          ),
        ).then((details) => ({ session, details }));

      it("works before the room opens, shows a waiting state, then lets the client in", async () => {
        const { booking } = await appointment("2 hours");
        const { session, details } = await emailLink(booking["id"]);
        expect(details["email"]).toMatch(/@example\.org$/);
        expect(Object.keys(details).sort()).toEqual(["email", "end", "name", "start"]);
        const [stored] =
          await sql`SELECT purpose, expires_at FROM public.booking_access_tokens WHERE token_hash=${sha256(session)}`;
        expect(stored!["purpose"]).toBe("session");
        expect(JSON.stringify(stored)).not.toContain(session);
        expect((await access(session))["state"]).toBe("early");
        await sql`UPDATE public.bookings SET confirmed_start=now(), confirmed_end=now()+interval '30 minutes' WHERE id=${booking["id"]}`;
        expect((await access(session))["state"]).toBe("open");
      });
      it("survives the client also joining from their booking page", async () => {
        const { manage, booking } = await appointment("5 minutes");
        const { session } = await emailLink(booking["id"]);
        await issue(manage);
        expect((await access(session))["state"]).toBe("open");
      });
      it("stops working when the appointment moves, cancels or the room closes", async () => {
        const { booking, reference } = await appointment("5 minutes");
        const { session } = await emailLink(booking["id"]);
        const version = (await bookingByReference(reference))["version"];
        await adminAction(booking["id"], "confirm", version, at(sat2, "13:00"));
        expect((await access(session))["state"]).toBe("unavailable");
        const moved = await bookingByReference(reference);
        await adminAction(booking["id"], "cancel", moved["version"]);
        expect(await failure(emailLink(booking["id"]))).toBe(
          "Only a confirmed, paid appointment can be emailed",
        );
        const over = await appointment("-46 minutes");
        expect(await failure(emailLink(over.booking["id"]))).toBe(
          "This appointment has already ended",
        );
      });
      it("records only that an email was sent, never who to or the link", async () => {
        const { booking } = await appointment("5 minutes");
        const { session } = await emailLink(booking["id"]);
        await asRole(
          sql,
          "authenticated",
          admin,
          (tx) =>
            tx`SELECT public.aviv_admin_record_confirmation_email(${booking["id"]}::uuid, true)`,
        );
        const [entry] =
          await sql`SELECT action, metadata FROM public.audit_logs WHERE resource_id=${booking["id"]} AND action LIKE 'confirmation_email%'`;
        expect(entry!["action"]).toBe("confirmation_email_sent");
        expect(JSON.stringify(entry)).not.toMatch(/example\.org/);
        expect(JSON.stringify(entry)).not.toContain(session);
      });
      it("is refused for guests and non-administrators", async () => {
        const { booking } = await appointment("5 minutes");
        expect(await failure(emailLink(booking["id"], rawToken(), member))).toMatch(
          /Administrator access required/,
        );
        for (const call of [
          `SELECT public.aviv_admin_confirmation_link('${booking["id"]}'::uuid,'${"a".repeat(64)}')`,
          `SELECT public.aviv_admin_record_confirmation_email('${booking["id"]}'::uuid,true)`,
        ])
          expect(await failure(asRole(sql, "anon", null, (tx) => tx.unsafe(call)))).toMatch(
            /permission denied/,
          );
      });
    });
    it("revokes entry when an appointment moves or is cancelled", async () => {
      const moved = await appointment("5 minutes");
      const movedLink = await issue(moved.manage);
      await access(movedLink.session);
      const version = (await bookingByReference(moved.reference))["version"];
      await adminAction(moved.booking["id"], "confirm", version, at(sat2, "13:00"));
      const row = await bookingByReference(moved.reference);
      expect(row["meeting_room_id"]).toBeNull();
      expect(row["meeting_provider"]).toBeNull();
      expect(row["meeting_link_issued_at"]).toBeNull();
      expect(row["session_status"]).toBe("not_started");
      expect((await access(movedLink.session))["state"]).toBe("unavailable");
      await adminAction(moved.booking["id"], "cancel", row["version"]);

      const cancelled = await appointment("5 minutes");
      const cancelledLink = await issue(cancelled.manage);
      const before = (await bookingByReference(cancelled.reference))["version"];
      await adminAction(cancelled.booking["id"], "cancel", before);
      expect((await access(cancelledLink.session))["state"]).toBe("unavailable");
      expect((await issue(cancelled.manage)).result["state"]).toBe("unavailable");
      expect((await adminAccess(cancelled.booking["id"], admin))["state"]).toBe("unavailable");
      // The guest can still read the cancellation.
      expect((await readGuest(sha256(cancelled.manage)))?.["booking_status"]).toBe("cancelled");
    });
    it("closes the room 15 minutes after the end", async () => {
      const open = await appointment("-44 minutes");
      expect((await issue(open.manage)).result["state"]).toBe("open");
      const over = await appointment("-46 minutes");
      expect((await issue(over.manage)).result["state"]).toBe("ended");
      expect((await adminAccess(over.booking["id"], admin))["state"]).toBe("ended");
    });
    it("refuses unpaid bookings even if marked confirmed", async () => {
      const { manage, reference, booking } = await appointment("5 minutes");
      await sql`UPDATE public.bookings SET payment_status='failed' WHERE public_reference=${reference}`;
      expect((await issue(manage)).result["state"]).toBe("unavailable");
      expect((await adminAccess(booking["id"], admin))["state"]).toBe("unavailable");
    });
    it("throttles guessed session links per client", async () => {
      const { manage } = await appointment("5 minutes");
      const { session } = await issue(manage);
      for (let i = 0; i < 20; i++) await access(rawToken(), "ip:session-guesser");
      expect(await access(session, "ip:session-guesser")).toEqual({ state: "rate_limited" });
      expect((await access(session, "ip:session-honest"))["state"]).toBe("open");
    });
    it("audits entry once per administrator without recording the room", async () => {
      const { booking } = await appointment("5 minutes");
      await adminAccess(booking["id"], admin);
      await adminAccess(booking["id"], admin);
      const entries =
        await sql`SELECT metadata FROM public.audit_logs WHERE action='session_opened' AND resource_id=${booking["id"]}`;
      expect(entries).toHaveLength(1);
      expect(JSON.stringify(entries)).not.toContain("aviv-");
    });
    it("is closed to browser roles and non-administrators", async () => {
      const { booking } = await appointment("5 minutes");
      expect(await failure(adminAccess(booking["id"], member))).toMatch(
        /Administrator access required/,
      );
      expect(
        await failure(
          asRole(
            sql,
            "anon",
            null,
            (tx) => tx`SELECT public.aviv_admin_session_access(${booking["id"]}::uuid)`,
          ),
        ),
      ).toMatch(/permission denied/);
      const hash = "a".repeat(64);
      for (const role of ["anon", "authenticated"] as const)
        for (const call of [
          `SELECT public.aviv_issue_session_link('${hash}','${hash}','k')`,
          `SELECT public.aviv_read_session_access('${hash}','k')`,
        ])
          expect(await failure(asRole(sql, role, member, (tx) => tx.unsafe(call)))).toMatch(
            /permission denied/,
          );
      for (const role of ["anon", "authenticated", "service_role"] as const)
        expect(
          await failure(
            asRole(sql, role, member, (tx) =>
              tx.unsafe(`SELECT public.aviv_session_room('${booking["id"]}'::uuid)`),
            ),
          ),
        ).toMatch(/permission denied/);
    });
  });

  describe("rate limiting", () => {
    it("counts within a window and prunes stale buckets", async () => {
      await sql`INSERT INTO public.rate_limit_buckets(key,window_start,attempts) VALUES ('stale',now()-interval '2 days',99)`;
      const consume = () =>
        asRole(
          sql,
          "service_role",
          null,
          (tx) => tx`SELECT public.aviv_consume_rate_limit('contact:ip:x',2,3600) ok`,
        ).then(([r]) => r!["ok"]);
      expect([await consume(), await consume(), await consume()]).toEqual([true, true, false]);
      expect(await sql`SELECT 1 FROM public.rate_limit_buckets WHERE key='stale'`).toHaveLength(0);
    });
  });
});
