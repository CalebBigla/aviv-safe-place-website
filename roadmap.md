# AVIV implementation roadmap

- [x] Phase 0–3 (earlier work): public site, CMS, administrator access, booking administration. See `docs/`.
- [x] Booking foundation (October 2026): git baseline; Africa/Lagos schedule; 30/60-minute sessions; server-authoritative availability; 30-minute slot holds with database-enforced no-overlap; administrator closures; guest booking links (hashed 256-bit tokens); bounded rate limiting; paid-only admin queue; CMS completion and safe delete; durable media URLs; sitemap/robots/canonical; accessibility fixes; database test suite. Migration `0008` must be applied to the Supabase project.
- [ ] Paystack: server-initialised checkout bound to a hold, signed and idempotent webhook (server route), server-side verification against the price snapshot, late-payment handling for expired holds.
- [ ] Daily.co: private rooms and short-lived session tokens issued from confirmed bookings, independent of guest manage links.
- [ ] Transactional email: hold/confirmation/cancellation messages carrying the manage link; no counselling details.
- [ ] Launch: approved services and FAQs, legal review of policies, production `VITE_SITE_URL`, Supabase Auth sign-up disabled for the public.
