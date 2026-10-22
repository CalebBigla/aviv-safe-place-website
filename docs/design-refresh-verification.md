# Warmth and interactive design refresh

## Changes
- Added a welcoming generated room scene with staggered entrance motion and a pause/play control.
- Added keyboard-accessible support exploration with supplied photographs and a generated illustrative connection image.
- Preserved the uploaded logo shape with teal, ivory and blush CSS variants and a logo favicon.
- Refined editable Privacy, Terms and Cancellation & Refund drafts to reflect stored enquiries, unavailable integrations, guest bookings and the 72-hour post-appointment rescheduling request window in Lagos time.

## Files and data
- `src/components/aviv-experience.tsx`, `src/components/aviv-site.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/styles.css`.
- Generated images in `src/assets`, uploaded logo asset pointer and `public/favicon.png`.
- `AGENTS.md`, `roadmap.md` and this report.
- Updated `pages.body` for `privacy`, `terms` and `cancellation-policy`; no schema or booking/payment logic changes.

## Verification
- Four Vitest files, nine tests passed.
- Desktop and 390px mobile screenshots reviewed; no horizontal overflow.
- Pause state, keyboard arrow selection, policy headings and current CMS text verified in browser.
- Reduced-motion preference disables scene animation and hides the motion control.
- No browser runtime errors observed. Screenshots: `/tmp/browser/entrance/`.

## Remaining gates
- Policy drafts require qualified Nigerian legal review; mandatory consumer rights override the proposed no-refund/forfeiture rule.
- Working business contact details, privacy-response and retention procedures must be approved before booking launch.
- Paystack, Daily and email integrations remain unconfigured and unavailable; no integration acceptance claimed.