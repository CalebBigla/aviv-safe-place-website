# AVIV Safe Place

**Heart Healed, Family Restored.** A multi-page counselling website with guest booking
and a protected administration area.

- **App:** React 19 + TanStack Start (SSR, file-based routes, server functions), TanStack Query, Tailwind/shadcn.
- **Data:** Supabase PostgreSQL (RLS), Supabase Auth (administrators only), Supabase Storage (private `aviv-media` bucket).
- **Hosting:** Render via Nitro (`render.yaml`; `npm run build` then `npm start`). Nitro detects the host when building, so Vercel also still works.
- **Server code:** TanStack server functions and server routes. Supabase Edge Functions are not used.

The original product brief is kept in [docs/product-brief.md](docs/product-brief.md).

## What is and isn't integrated

| Area | Status |
|---|---|
| Public pages, CMS, administrator sign-in | Working |
| Availability, slot holds, guest booking links | Working (requires migration `0008`, see below) |
| Paystack payments | Built (requires migration `0014`, `PAYSTACK_SECRET_KEY` and the webhook URL, see below). |
| Agora video sessions | Built (requires migrations `0011`, `0012` and Agora credentials, see below). |
| Confirmation email | Built on Resend (requires `RESEND_API_KEY` and `EMAIL_FROM`). Only confirmations are emailed; contact enquiries are stored for administrators. |
| Bot check | Built on Cloudflare Turnstile (requires `VITE_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`). |

## Booking rules

- **Schedule (Africa/Lagos, WAT, UTC+1, no daylight saving):** Monday and Wednesday 10:00–13:00, Saturday 10:00–15:00. Other days are closed.
- **Sessions:** 30 or 60 minutes, set per service. Starts sit on a 30-minute grid, from 10:00 to one hour before closing (12:00 on weekdays, 14:00 on Saturday), and every session ends by closing.
- **Authority:** the database decides (`public.aviv_slot_valid`, `public.aviv_slot_availability`). `src/lib/aviv/schedule.ts` mirrors the same rules for display only.
- **Holds:** choosing a time creates a 30-minute hold, a `pending` booking with `bookings.slot` set. An exclusion constraint makes overlapping claims impossible, including under concurrent requests. Lapsed holds become `expired` inside the next scheduling transaction, so no cron job is needed.
- **Closures:** administrators close periods under **Admin → Availability**. A closure can't overlap an existing booking or hold.
- **Lifecycle:** `pending` (hold) → *(payment verified with Paystack)* → `pending` + `successful` (awaiting AVIV) → `confirmed` → `completed`. Other states are `reschedule_requested`, `cancelled` and `expired`. Only paid bookings appear in the administration queue. Admin actions run in a transactional database function with optimistic locking, the schedule, closures and the booking's own duration snapshot.
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
- **Client entry:** confirming an appointment emails the client a `/session/:token` link. "Join your video session" on the booking link creates another. Only hashes are stored, and opening either link before the room opens shows a waiting page.
- **Administrator entry:** "Join video session" on the booking detail page opens `/admin/session/:id`. Identity, two-factor and role are rechecked on every token request.
- **Revocation:** moving, cancelling or completing an appointment revokes session links and clears the room. RTC tokens last at most 15 minutes and renewal rechecks the booking, so anyone still connected is removed when their current token runs out.
- **Privacy:** room names are random and no names or emails are sent to Agora. Media is encrypted in transit with a per-room key (`aes-256-gcm2`) derived on the server. The SDK shares that key with Agora, so this is not end-to-end encryption that excludes Agora. Recording is not enabled.

To enable it, create an Agora project **with the App Certificate enabled**, then set `AGORA_APP_ID` and `AGORA_APP_CERTIFICATE` as server-only values. Camera and microphone access need HTTPS (or `localhost`).

## Payments (Paystack)

- **Checkout:** "Pay now" on the "time held" page or the booking link starts a Paystack hosted checkout from the server, for the booking's saved price. Starting checkout extends the hold to 15 minutes from then, but never beyond 45 minutes after the booking was made.
- **Verification:** a booking is only marked paid after the server asks Paystack's API whether the payment succeeded. Both the return page (`/booking/success`) and the signed webhook (`/api/paystack/webhook`) do this, and each payment is applied once however often it is reported.
- **Edge cases:** a payment after the hold lapsed keeps the time if it's still free; otherwise the booking is marked paid but expired and flagged for refund review. A second payment for an already-paid booking is flagged for refund review. A wrong amount or currency is never applied. Refunds are made in the Paystack dashboard.
- **Setup:** set `PAYSTACK_SECRET_KEY` (`sk_test_…` while testing, `sk_live_…` for real payments), and in Paystack → Settings → API Keys & Webhooks set the webhook URL to `https://<your-site>/api/paystack/webhook`, separately for test and live mode.

## Confirmation email

Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend). The email carries the time and the video link, and deliberately leaves out the type of session, because inboxes are often shared or previewed. If sending fails the appointment stays confirmed, the administrator is told, and **Send confirmation email** on the booking page sends a new link. The audit log records only whether an email was sent.

## Security

- **Administrator two-factor:** **temporarily off for testing, so a password alone gives administrator access.** Restore it before real clients use the site: set `ADMIN_TWO_FACTOR_REQUIRED` to true in `src/lib/aviv/admin-policy.ts` and restore the check in `public.has_role` (see migration `0013`). When on, administrators set up an authenticator app at first sign-in, and the database refuses administrator rights without it. If someone loses their device, an owner removes the factor under Supabase → Authentication → Users.
- **Public sign-up:** must be disabled under Supabase → Authentication → Sign In / Providers. The site has no sign-up form, but the Supabase API accepts sign-ups unless this is off. Create administrators by invitation from the dashboard.
- **Rate limits:** keyed on a hash of the client address the host's own proxy supplies: Vercel's header on Vercel, and the last `X-Forwarded-For` entry elsewhere (Render appends the real address after anything the visitor sent). Holds, availability, the contact form and guest links all have limits, and availability and the contact form can only be reached through the server.
- **Headers:** `src/lib/aviv/security-headers.ts` sets the content security policy, framing, referrer and camera/microphone rules, and `no-store` on private pages.

## Deploying to Render

1. In Render, choose **New → Blueprint**, select this GitHub repository, and Render reads `render.yaml`.
2. Enter the environment variables it asks for, using the same values as `.env`. Set `VITE_SITE_URL` to the site's address (for example `https://aviv-safe-place.onrender.com`, or your own domain).
3. After the first deploy, add the site's address to Supabase → Authentication → URL Configuration, and set Paystack's webhook URL to `https://<site>/api/paystack/webhook`.
4. Apply migrations with `npm run db:migrate`.

**Free plan:** the service sleeps after 15 minutes without traffic and takes up to a minute to wake. To keep it awake while testing, have an external monitor such as UptimeRobot or cron-job.org request `https://<site>/api/health` every 10 minutes. It has to be external, since a sleeping service can't wake itself. Keep only **one** free service awake: a whole month uses about 744 of the 750 free hours, and running out suspends every free service until the next month. Switch the plan to **Starter** before real clients use the site.

## Deploying to Vercel

1. Import the GitHub repository. `vercel.json` sets the build. No other build settings are needed.
2. Add the environment variables from `.env.example`. Use separate values for Preview deployments, or none, rather than production keys.
3. Deploy, then add the site's URL to Supabase → Authentication → URL Configuration so password reset emails work.
4. Apply migrations with `npm run db:migrate`. **On a fresh deployment, do this after the code is live**, because migration `0012` requires server-only calls that earlier code doesn't support.

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
| `npm run build` | Production build for Vercel |

The database tests need a **local, disposable** PostgreSQL. They refuse non-local hosts and recreate a database named `aviv_test`:

```sh
AVIV_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
```

## SEO

`/sitemap.xml` and `/robots.txt` are generated. Set `VITE_SITE_URL` to the public origin to enable canonical URLs, `og:url`, share images and structured data. Without it these are omitted rather than emitted with the wrong host. Administration, booking-link, session and password pages are `noindex` and disallowed in robots.txt.
