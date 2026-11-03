# AVIV implementation roadmap

- [x] Phase 0–3 (earlier work): public site, CMS, administrator access, booking administration. See `docs/`.
- [x] Booking foundation (October 2026): git baseline; Africa/Lagos schedule; 30/60-minute sessions; server-authoritative availability; 30-minute slot holds with database-enforced no-overlap; administrator closures; guest booking links (hashed 256-bit tokens); bounded rate limiting; paid-only admin queue; CMS completion and safe delete; durable media URLs; sitemap/robots/canonical; accessibility fixes; database test suite. Migration `0008` must be applied to the Supabase project.
- [ ] Paystack: server-initialised checkout bound to a hold, signed and idempotent webhook (server route), server-side verification against the price snapshot, late-payment handling for expired holds.
- [x] Agora video sessions (November 2026): private two-seat rooms for confirmed, paid appointments; session links separate from manage links; short-lived renewing RTC tokens; browser-to-browser media encryption. Migration `0011` must be applied, and `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` set. Live two-person call testing is still required, and clients can only reach a room once Paystack is connected.
- [ ] Transactional email: hold/confirmation/cancellation messages carrying the manage link; no counselling details.
- [ ] Launch: approved services and FAQs, legal review of policies, production `VITE_SITE_URL`, Supabase Auth sign-up disabled for the public.
