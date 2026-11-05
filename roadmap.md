# AVIV implementation roadmap

- [x] Phase 0–3 (earlier work): public site, CMS, administrator access, booking administration. See `docs/`.
- [x] Booking foundation (October 2026): git baseline; Africa/Lagos schedule; 30/60-minute sessions; server-authoritative availability; 30-minute slot holds with database-enforced no-overlap; administrator closures; guest booking links (hashed 256-bit tokens); bounded rate limiting; paid-only admin queue; CMS completion and safe delete; durable media URLs; sitemap/robots/canonical; accessibility fixes; database test suite. Migration `0008` must be applied to the Supabase project.
- [ ] Paystack: server-initialised checkout bound to a hold, signed and idempotent webhook (server route), server-side verification against the price snapshot, late-payment handling for expired holds.
- [x] Agora video sessions (November 2026): private two-seat rooms for confirmed, paid appointments; session links separate from manage links; short-lived renewing RTC tokens; media encrypted in transit with a per-room key. Migration `0011` must be applied, and `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` set. Clients can only reach a room once Paystack is connected.
- [x] Confirmation email (November 2026): the video link is emailed through Resend when an appointment is confirmed, with no counselling details. Needs `RESEND_API_KEY` and `EMAIL_FROM`.
- [ ] Other transactional email: hold and cancellation messages.
- [x] Security hardening (November 2026): administrator two-factor, Turnstile bot check, security headers, server-only availability and contact functions. Migration `0012` must be applied after the code is deployed.
- [ ] Restore administrator two-factor, off for testing since migration `0013`, and decide between authenticator app and email codes. **Required before real clients use the site.**
- [ ] Launch: approved services and FAQs, legal review of policies, production `VITE_SITE_URL`, Supabase Auth sign-up disabled for the public.
