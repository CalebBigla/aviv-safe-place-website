# AVIV Safe Place

**Heart Healed, Family Restored.** A multi-page counselling website with guest booking
and a protected administration area.

- **App:** React 19 + TanStack Start (SSR, file-based routes, server functions), TanStack Query, Tailwind/shadcn.
- **Data:** Supabase PostgreSQL (RLS), Supabase Auth (administrators only), Supabase Storage (private `aviv-media` bucket).
- **Hosting:** Cloudflare Workers via Nitro (`npm run build` produces `dist/`).
- **Server code:** TanStack server functions and server routes. Supabase Edge Functions are not used.

The original product brief is kept in [docs/product-brief.md](docs/product-brief.md).

## What is and isn't integrated

| Area | Status |
|---|---|
| Public pages, CMS, administrator sign-in | Working |
| Availability, slot holds, guest booking links | Working (requires migration `0008`, see below) |
| Paystack payments | **Not integrated.** No payment is taken and nothing is ever marked paid. |
| Agora video sessions | Built (requires migration `0011` and Agora credentials, see below). Confirmed appointments need a verified payment, so clients can't reach a room until Paystack is connected. |
| Transactional email | **Not integrated.** Contact enquiries are stored for administrators; guests keep their private booking link. |

## Booking rules

- **Schedule (Africa/Lagos, WAT, UTC+1, no daylight saving):** Monday and Wednesday 10:00–13:00, Saturday 10:00–15:00. Other days are closed.
- **Sessions:** 30 or 60 minutes, set per service. Starts sit on a 30-minute grid, from 10:00 to one hour before closing (12:00 on weekdays, 14:00 on Saturday), and every session ends by closing.
- **Authority:** the database decides (`public.aviv_slot_valid`, `public.aviv_slot_availability`). `src/lib/aviv/schedule.ts` mirrors the same rules for display only.
- **Holds:** choosing a time creates a 30-minute hold, a `pending` booking with `bookings.slot` set. An exclusion constraint makes overlapping claims impossible, including under concurrent requests. Lapsed holds become `expired` inside the next scheduling transaction, so no cron job is needed.
- **Closures:** administrators close periods under **Admin → Availability**. A closure can't overlap an existing booking or hold.
- **Lifecycle:** `pending` (hold) → *(verified payment, future phase)* → `pending` + `successful` (awaiting AVIV) → `confirmed` → `completed`. Other states are `reschedule_requested`, `cancelled` and `expired`. Only paid bookings appear in the administration queue. Admin actions run in a transactional database function with optimistic locking, the schedule, closures and the booking's own duration snapshot.
- **Snapshots:** price, service title and duration are copied onto the booking and cannot change afterwards.

## Guest booking links

The server generates a 256-bit random token, returns it to the guest once, and stores only its SHA-256 hash. The link (`/booking/manage/:token`) is read-only.
- It shows status, time, fee and reference, and never the guest's name, email or database IDs.
- It expires 30 days after the appointment's scheduled end.
- Cancelling a booking keeps the link working so the guest can see the cancellation.
- Repeated invalid lookups are throttled per client (by hashed IP, never a raw address). Normal refreshes are not throttled.
- This link is **not** a video-session credential. While the room is open it can be exchanged for a separate `session` link.

## Video sessions (Agora)

Each confirmed, paid appointment gets one private room with two seats, one for the counsellor and one for the client.

- **Hours:** the room opens 15 minutes before the appointment and closes 15 minutes after it ends. `public.aviv_session_room` decides; `src/lib/aviv/session-schema.ts` mirrors it for display.
- **Client entry:** "Join your video session" on the booking link creates a `/session/:token` link. Only its hash is stored and only the newest link for a booking works.
- **Administrator entry:** "Join video session" on the booking detail page opens `/admin/session/:id`. Identity and role are rechecked on every token request.
- **Revocation:** moving, cancelling or completing an appointment revokes session links and clears the room. RTC tokens last at most 15 minutes and renewal rechecks the booking, so anyone still connected is removed when their current token runs out.
- **Privacy:** room names are random and no names or emails are sent to Agora. Media is encrypted with a per-room key (`aes-256-gcm2`) derived on the server. Recording is not enabled.

To enable it, create an Agora project **with the App Certificate enabled**, then set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` as server-only values. Camera and microphone access need HTTPS (or `localhost`).

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in (see the comments there). Server-only values never use a `VITE_` prefix.
3. Apply migrations to your Supabase project: `npm run db:check`, then `npm run db:migrate` (uses `DATABASE_URL`). `drizzle-kit push` is deliberately disabled.
4. Create the first administrator in Supabase Auth, then grant the role from the SQL editor:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<AUTH_USER_UUID>'::uuid, 'admin')
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

5. `npm run dev`

Guest booking, booking links and the contact form need a real `SUPABASE_SERVICE_ROLE_KEY`. Without it they show a "temporarily unavailable" message rather than failing silently.

## Checks

| Command | What it does |
|---|---|
| `npx tsc --noEmit` | Strict type check |
| `npm run lint` | ESLint + Prettier (generated Supabase files are excluded) |
| `npm test` | Unit tests; database tests are skipped unless configured |
| `npm run test:db` | Database tests (schedule, holds, overlap/concurrency, closures, tokens, RLS/grants, admin lifecycle) |
| `npm run build` | Production build |

The database tests need a **local, disposable** PostgreSQL. They refuse non-local hosts and recreate a database named `aviv_test`:

```sh
AVIV_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
```

## SEO

`/sitemap.xml` and `/robots.txt` are generated. Set `VITE_SITE_URL` to the public origin to enable canonical URLs, `og:url`, share images and structured data. Without it these are omitted rather than emitted with the wrong host. Administration, booking-link, session and password pages are `noindex` and disallowed in robots.txt.
