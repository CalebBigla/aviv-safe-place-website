# AVIV implementation roadmap

- [x] Current design update: welcoming entrance scene, pausable/reduced-motion-aware animation, keyboard-accessible support exploration, generated editorial imagery and uploaded logo variants; CMS-backed legal drafts refined and desktop/mobile verified. See `docs/design-refresh-verification.md`; legal review still required.

- [x] Phase 3 core: real operational counts, searchable/paginated booking management, validated appointment actions with audit history, CMS content previews/atomic reordering, loading states and browser verification; see `docs/phase-3-verification.md`.
- [ ] Phase 3 provider-dependent actions: Daily meeting setup and confirmation email resend require configured, tested providers; no substitutes.
- [ ] Phase 4: guest booking and verified Paystack workflow — begin only after Phase 3 acceptance; blocked by payment/video/email setup and approved bookable catalogue.

- [x] Current request: implement Phase 2 data integrity, administrator access, CMS editing and media; public readback, database constraints, RLS and mobile flows verified.

- [x] Phase 0: inspect starter, integrations, configuration and reusable code.
- [x] Phase 0: document architecture and gated implementation plan for review.
- [x] Current update: reviewed uploaded brand guide; stored safe dummy contacts, source-based About text and draft privacy/terms/no-refund policies; email remains unavailable.
- [x] Phase 1: design system, separate public pages, Cloud content schema and safe unavailable contact handling; browser and build checks pass.
- [ ] Phase 1 acceptance: approved service prices/durations and FAQs, working contact details and legal review — brand guide received; dummy contacts and draft policies added.
- [ ] Phase 1 acceptance: actual contact email delivery and stronger anti-spam verification — blocked by owned sender domain and approved recipient/setup.
- [x] Phase 1 acceptance: administrator CMS editing/publication flow — Phase 2 completed and public content readback tested.
- [x] Administrator onboarding: melodytech01@gmail.com confirmed the invitation and signed in; active administrator role verified.
- [ ] Current request: prepare Phases 4–6 sequentially without Paystack/Daily accounts; each preparation stage must pass local checks, while full integration acceptance remains blocked by provider testing.
- [x] Phase 4 preparation: guest booking forms, validation, immutable service/price snapshots and hashed expiring/revocable access foundations; browser guest review and secure readback verified, 9 tests passed. Checkout stays closed and submissions are not retained; see `docs/phase-4-preparation-verification.md`.
- [ ] Phase 5 preparation: authoritative payment initiation/verification, signed idempotent webhook processing and trusted result states; live acceptance awaits Paystack test credentials.
- [ ] Phase 6 preparation: private Daily room workflow, one-time invitations, safe reconnection and authorised client/staff entry; live acceptance awaits Daily credentials and verified email domain.