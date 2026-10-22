# Phase 4 — guest booking preparation

## Result
Preparation checks passed. Full Phase 4 acceptance has **not** passed: a guest cannot yet pay, receive an emailed management link, or receive appointment confirmation. Checkout fails closed and does not retain guest submissions while Paystack is unavailable. No client accounts were introduced.

## Changes
- `/book` now provides published-service selection, current CMS price/duration, guest details, Lagos-time preferences, policy acknowledgement and review.
- Empty catalogue remains an honest unavailable state. No production services or prices were invented.
- Service-only request creation validates published active services and future preferences, takes immutable service/price/duration snapshots and atomically stores a hashed management token. This operation is not wired into public submission until secure checkout exists.
- Secure management readback validates the capability, limits reads, denies expired/revoked links and projects status without client identity or provider credentials.
- Payment and appointment state remain separate. Returning to `/booking/success` is not proof of payment.
- Public checkout and email/video operations remain unavailable; no provider mocks were added.

## Files and database objects
- `src/components/aviv-guest-booking.tsx`
- `src/lib/aviv/guest-booking-schema.ts`
- `src/lib/aviv/guest-booking.functions.ts`
- `src/routes/book.tsx`
- `src/routes/booking.manage.$token.tsx`
- `src/test/aviv-guest-booking.test.ts`
- `drizzle/migrations/0006_aviv_guest_booking_preparation.sql`
- `drizzle/migrations/0007_aviv_guest_reference_generation.sql`
- Generated application database types, `AGENTS.md`, and `roadmap.md`

Database changes: booking expiry, service title/duration snapshots and policy acknowledgement; service-only `aviv_create_guest_request` and `aviv_read_guest_booking`. Reference generation uses built-in `gen_random_uuid` rather than an unavailable unqualified extension function. Anonymous and authenticated roles have no execution grants on either capability function.

## Verification
- Vitest: **4 files / 9 tests passed**, including all three guest validation/token tests.
- Automatic build telemetry: **build OK**.
- Browser: temporary published test service → details and policy acceptance → review; checkout disabled, no client account requested.
- Browser/database: temporary request → secure status readback → revocation denied → expiration denied. Client email was not shown in readback.
- Mobile: 390 × 844 page contained within viewport; desktop 1280 × 1800 review was legible.
- Browser reported no page errors. All temporary services, bookings and tokens were removed after testing.
- Screenshots: `/tmp/browser/phase4/review.png`, `/tmp/browser/phase4/mobile.png`.
- Content-route metadata inspected, including index; booking and capability routes retain app-specific titles and private-link noindex/no-referrer metadata.

## Remaining gates
- Phase 5 preparation: real server-side Paystack initiation/verification, signed idempotent webhooks, abandoned/failed/delayed/late-payment reconciliation and trusted return states. Real provider acceptance requires Paystack test credentials.
- Approved published service names, prices and durations.
- Owned verified email domain, expected-client email delivery and real confirmation tests.
- Daily private meeting creation/authorised entry and real provider verification in Phase 6.
- Full Phase 3 provider actions and Phase 4 paid guest journey remain pending. Proceed to the next preparation stage only as a distinct phase; do not represent these checks as integration acceptance.