# AVIV Phase 1 — implementation and verification

## Status
Public presentation and data foundations are implemented. Phase 1 acceptance is **not complete**: the brand identity PDF has now been received and About copy added; service details remain missing, contact details are labelled placeholders, policies are drafts requiring legal review, and no sender domain or recipient is configured. Phase 2 has not started. The website is not published.

## 13 October content update
- Reviewed the uploaded brand guide, including logo and palette page images; used its purpose, vision and values without treating mockup contact names or dates as real business facts. Existing visual styling remains unchanged.
- Added six public contact/social settings as explicitly labelled, inactive placeholders; shared contact rendering validates working links and never links dummy channels.
- Added four CMS-backed pages: About, draft Privacy Policy, draft Terms and draft Cancellation & Refund Policy. No schema changes.
- User's no-refund rule is drafted subject to mandatory legal remedies. The three-day rescheduling window is interpreted as a request within 72 hours after the original start time in Lagos, not replacement attendance within that period. Enforcement remains future booking work.
- Files changed: `src/components/aviv-site.tsx`, `src/routes/contact.tsx`, `AGENTS.md`, `roadmap.md`, this report. Data changed: `public_settings`, `pages`. Email stays off; no CMS dashboard or booking automation added.
- Verification: saved Cloud content read back through five public pages in Playwright with unique metadata and no runtime errors; dummy email has no active link, six contact fields are labelled, mobile contact has no horizontal overflow. Desktop contact/policy and mobile contact screenshots inspected with no overlap or clipping found. Latest automatic build signal: build OK at 20:18:01 UTC. FCCPC official guidance confirms advance-booking cancellation/refund rights; draft Terms and cancellation text explicitly retain them rather than promising an enforceable blanket no-refund rule.

## Changes
- AVIV semantic colour tokens, Archivo/DM Sans font alternatives, shared responsive navigation/footer, accessible mobile menu, and illustrative generated room imagery.
- Separate Home, Services, About, Contact, Book, policy pages and honest unavailable booking/session entry pages.
- Per-route app-specific metadata, canonical preview-origin links for public content and noindex on capability entry pages.
- Cloud-connected published-content reads for services, FAQs, page content and settings. No invented service rows, prices, credentials, biographies or policy provisions.
- General contact input validation on client/server, honeypot and atomic email-hash rate limit. Real submission currently reports unavailable; it does not send or retain the message. This is not a functional email integration, and distributed anti-spam protection remains for completion.
- No payment, video, client accounts or administrator UI introduced in this phase.

## Files created or modified
- `src/styles.css`, `src/components/ui/button.tsx`, `src/components/aviv-site.tsx`.
- `src/routes/__root.tsx`, `index.tsx`, `services.tsx`, `about.tsx`, `contact.tsx`, `book.tsx`, `privacy.tsx`, `terms.tsx`, `cancellation-policy.tsx`, `booking.success.tsx`, `booking.manage.$token.tsx`, `session.$token.tsx`.
- `src/lib/aviv/content.functions.ts`, `queries.ts`, `metadata.ts`, `contact-schema.ts`, `contact.functions.ts`.
- `src/assets/aviv-sanctuary.jpg`, `public/favicon.svg`; removed default favicon.
- `drizzle/migrations/0000_aviv_public_content_foundation.sql`, `0001_restrict_aviv_function_execution.sql` and migration-tool-managed journal/schema files.
- Cloud-generated integration/configuration/types and installed dependencies; automatic route-tree regeneration.
- `AGENTS.md`, `roadmap.md`, this report and archived approved plan; project memory records approved requirements.

## Database objects
- Tables: `user_roles`, `services`, `pages`, `faqs`, `public_settings`, `rate_limit_buckets`.
- Enum: `app_role`; functions: `has_role`, `consume_contact_limit`; published-page unique index and table constraints.
- Explicit table grants and RLS policies; anonymous published content reads only, separate administrator role management policies; server-only rate-limit function.
- All six tables have RLS verified. Anonymous function execution was initially inherited from hosted defaults; a second migration explicitly revoked it and readback verified the correction.
- Remaining linter findings are intentional: server-only rate-limit table has no client policies; authenticated role-check function must remain callable for authorisation. No anonymous security-definer execution remains.
- No approved content inserts, email tables, bookings/payment/video tables, storage buckets or Auth users were created.

## Tests and observed results
- Latest automatic build signal: **build OK**, 2026-10-13 19:58:40 UTC; earlier form/settings type errors resolved.
- Existing Vitest routing test: **1 passed**.
- Playwright: all eleven public/content/status/session URLs load with the expected unique title and heading; **no page runtime errors**.
- Desktop booking CTA navigates to `/book` and renders its heading. Mobile menu Services link navigates and renders the Services heading; 390px page has **no horizontal overflow**.
- Desktop and mobile screenshots inspected: imagery, text and buttons render without overlap.
- Contact empty-form validation shown; a valid general enquiry reaches the real server rate-limit call and reads back an honest unavailable response. **No email sent**.
- Database linter and privilege readback performed. Real populated service reads, unpublished draft isolation with sample records, admin editing, live email delivery, payments and video are **not verified**.

## Requirements before Phase 1 can pass
1. Supply approved service names, descriptions, fees, durations/formats and FAQs; replace dummy contact values before launch and obtain legal review of the drafted policies. The uploaded brand guide is now available.
2. Set up a sender domain you own and supply the approved destination contact. Then implement and test actual delivery and stronger spam checks.
3. Populate approved content and verify its public readback/draft isolation, content accessibility and final layout.
4. Administrator identity and the subsequent CMS/auth application belong to Phase 2, after Phase 1 passes.