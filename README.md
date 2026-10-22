# AVIV Safe Place Website

## Supabase database setup

1. Copy `.env.example` to `.env` and use the same project reference as `supabase/config.toml`.
2. Set the public URL and publishable key in both the `SUPABASE_*` and `VITE_SUPABASE_*` variables. Set `SUPABASE_SERVICE_ROLE_KEY` for server-only operations; never expose it through a `VITE_` variable.
3. Set `DATABASE_URL` to the project's private PostgreSQL connection URL. URL-encode special characters in its password.
4. Run `npm run db:check` to verify the local migration journal, then `npm run db:migrate` to apply pending Drizzle migrations to the configured database.
5. Create the first administrator in Supabase Auth, then grant the admin role once from the Supabase SQL editor using that user's Auth UUID:

   ```sql
   INSERT INTO public.user_roles (user_id, role)
   VALUES ('<AUTH_USER_UUID>'::uuid, 'admin')
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

The project reference in `supabase/config.toml` identifies the Supabase project but does not authenticate or apply migrations. Keep `.env` private. The database migration URL and service-role key are required for a complete local server and database setup.

Brand: AVIV Safe Place
Tagline: Heart Healed, Family Restored.
Project type: Multi-page counselling website and appointment platform
Implementation: TanStack Start
Backend: Supabase (PostgreSQL, Auth for administrators, Edge Functions, Storage)
Payment gateway: Paystack
Video infrastructure: Daily Video SDK
Email: Transactional email provider, selected during implementation
Currency: NGN (₦, $)
Booking model: Guest booking, no client accounts
Appointment model: Admin-confirmed appointments
Development approach: Phased implementation, testing, and verification
________________________________________
PROJECT-WIDE RULES
These requirements apply to every phase. Follow them throughout the project.
1. Brand identity and design direction
Use the uploaded AVIV profile as the primary source of truth for brand identity and approved content.
•	Brand name: AVIV Safe Place.
•	Tagline: Heart Healed, Family Restored.
•	Core identity: emotional safety, restoration, family, hope, and compassionate support.
•	Brand colours:
o	Deep teal: #213D43
o	Warm ivory: #F4F0E8
o	Soft blush: #F2BFC2
o	Mint: #5CF5C1
•	Typography direction: Founders Grotesk for headings and Aeonik for body text, where the fonts are legally available. If unavailable, choose close, professional alternatives.
•	Create a premium, warm, restrained, contemporary visual experience.
•	Use generous whitespace, elegant typography, subtle transitions, considered imagery, and consistent spacing.
•	Avoid excessive gradients, glowing effects, generic AI-generated design patterns, excessive rounded cards, unnecessary animations, and overcrowded sections.
•	The design must feel trustworthy, emotionally sensitive, and professionally art-directed.
•	Prioritise accessibility, readable contrast, responsive layouts, and excellent mobile usability.
Do not invent professional credentials, therapist licences, testimonials, success rates, years of experience, partner organisations, or medical claims.
If information is missing from the uploaded profile, create an editable CMS field or a clearly identified placeholder. Do not publish invented facts.
2. Required public pages
The website must have distinct, navigable routes:
•	/ — Home
•	/services — Services
•	/about — About AVIV
•	/contact — Contact
•	/book — Book a Session
•	/booking/success — Booking/payment status
•	/booking/manage/:token — Secure guest booking details
•	/session/:token — Secure video session entry
Do not combine the entire website into a single scrolling landing page.
Use a consistent navigation bar, footer, typography system, buttons, and responsive behaviour across all public pages.
3. Administrator routes
Create a protected admin application with:
•	/admin/login
•	/admin — Dashboard
•	/admin/bookings
•	/admin/bookings/:id
•	/admin/services
•	/admin/pages
•	/admin/media
•	/admin/settings
Only authorised administrators may access these routes and their underlying data.
Do not create client registration, client login, client onboarding, or a client portal in this release.
4. Mandatory technical and security rules
•	Use Supabase PostgreSQL for persistent application data.
•	Use Supabase Row Level Security (RLS) for protected tables.
•	Perform privileged actions through secure server-side Edge Functions.
•	Keep Paystack secret keys, Daily API keys, email-provider credentials, and Supabase service-role credentials out of browser code.
•	Never trust frontend prices, payment-success messages, booking ownership, appointment status, or video-room permissions.
•	Verify payments server-side.
•	Verify Paystack webhook signatures using the exact raw request body and the documented signature method.
•	Make webhook processing idempotent.
•	Generate Daily rooms and meeting tokens server-side.
•	Use private Daily rooms and short-lived meeting tokens with the least privilege required.
•	Use cryptographically secure, high-entropy booking and session tokens. Store token hashes where appropriate.
•	Never expose database IDs or predictable booking references as the only means of accessing private booking information.
•	Validate and authorise every privileged operation on the server.
•	Do not place counselling details, sensitive personal disclosures, or session notes in ordinary email notifications.
•	Do not record counselling sessions by default.
•	Never mark a payment as successful solely because the user returned from Paystack.
•	Do not replace existing working features with mock data.
•	Do not claim an integration is functional until it has been tested against its real service.
5. Implementation discipline
Before editing existing code, inspect the current project and identify its framework, routes, installed packages, existing integrations, and current state.
Preserve working functionality. Reuse existing components where appropriate.
At the end of every phase:
1.	Summarise the changes.
2.	List files and database objects created or modified.
3.	Report tests performed and their results.
4.	Identify any remaining issues or configuration requirements.
5.	Do not start the next phase until the current phase passes its acceptance criteria.
________________________________________
PHASE 0 — PROJECT AUDIT AND IMPLEMENTATION PLAN
Implementation brief
You are a senior software architect and product designer. Before implementing AVIV Safe Place, inspect the existing project.
Do not begin a large implementation immediately.
Tasks
1.	Inspect the project structure, framework, routing, dependencies, components, styles, existing database integration, and environment-variable setup.
2.	Identify whether Supabase is already connected and whether any schema, Edge Functions, authentication, or storage policies already exist.
3.	Identify reusable code and potential conflicts.
4.	Establish the application architecture for:
o	Public multi-page website.
o	Guest booking flow.
o	Administrator dashboard.
o	CMS.
o	Paystack payment processing.
o	Daily video sessions.
o	Transactional email.
5.	Establish a consistent design system using the AVIV brand direction defined in this document.
6.	Produce a phased implementation plan that identifies dependencies and security-sensitive operations.
Constraints
•	Do not introduce client accounts.
•	Do not create a single-page website.
•	Do not add payment, video, or email mock integrations that could be mistaken for real functionality.
•	Do not remove working functionality without justification.
•	Do not invent business information absent from the supplied profile.
Acceptance criteria
•	Existing project structure is understood.
•	Routes and dependencies are documented.
•	Architecture and database requirements are identified.
•	The phased plan is ready.
•	No unnecessary code changes have been made.
________________________________________
PHASE 1 — PREMIUM MULTI-PAGE PUBLIC WEBSITE
Implementation brief
Build the public-facing AVIV Safe Place website as a polished, responsive, multi-page experience.
Use the uploaded AVIV profile as the primary source for content and brand identity.
A. Global navigation
Create a professional responsive navbar with:
•	AVIV Safe Place logo or wordmark.
•	Home.
•	Services.
•	About.
•	Contact.
•	Primary CTA: Book a Session.
The CTA must navigate to /book.
On mobile, provide an accessible navigation menu with appropriate focus and keyboard behaviour.
B. Home page
Create a complete homepage with carefully structured sections:
1.	Hero section
o	Communicate AVIV's identity and value proposition.
o	Use the tagline: “Heart Healed, Family Restored.”
o	Include a primary “Book a Session” CTA.
o	Include a secondary CTA leading to Services.
o	Use warm, authentic, appropriate imagery and refined typography.
2.	Introduction
o	Explain the purpose of AVIV Safe Place using approved profile content.
o	Communicate compassion, emotional safety, and restoration without making unsupported claims.
3.	Services preview
o	Display published services from the database.
o	Show each service's title, concise description, duration, price, and booking CTA.
o	Link each service to its detail section on /services or the booking flow.
4.	Why AVIV
o	Present only verifiable values and differentiators from the approved profile.
o	Do not invent statistics or professional credentials.
5.	Approach and experience
o	Explain the support experience in empathetic, accessible language.
o	Avoid guaranteeing outcomes or presenting the service as a substitute for emergency care.
6.	Booking process
o	Explain how clients choose a service, provide their details, pay, receive confirmation, and attend a session.
7.	FAQ preview
o	Retrieve published FAQs from the CMS.
o	Link to the full FAQ section on the appropriate page.
8.	Final CTA
o	Encourage visitors to book a session.
9.	Footer
o	Contact details sourced from settings.
o	Navigation links.
o	Published social links, if available.
o	Privacy Policy, Terms, and Cancellation/Refund Policy links.
C. Services page — /services
Create a dedicated services directory.
Each service must have:
•	Service title.
•	Description.
•	Intended audience, if approved.
•	Duration.
•	Price in NGN.
•	Delivery format.
•	Published/unpublished state.
•	Booking CTA.
Load service information from Supabase. Do not hardcode service prices into the UI.
Only active, published services may be booked.
If a service needs additional information, provide a detail layout or accessible detail modal without overwhelming the page.
D. About page — /about
Use the uploaded profile to communicate:
•	AVIV's story and purpose.
•	Mission and vision, only if provided or approved.
•	Values and philosophy.
•	The meaning behind “Heart Healed, Family Restored.”
•	Team or founder information only when supported by the source material.
Create an elegant editorial layout rather than a generic corporate template.
E. Contact page — /contact
Include:
•	Contact details from CMS settings.
•	A contact form with name, email, subject, and message.
•	Validation and clear success/error states.
•	Server-side submission handling.
•	Spam protection and rate limiting.
•	A clear booking CTA.
Do not expose private email-provider credentials or store sensitive counselling disclosures unnecessarily.
F. Book a Session page — /book
Build the entry point to the booking flow.
Display published services, prices, durations, and a clear explanation of the booking and confirmation process.
Make it explicit that clients can book without creating an account.
G. Design quality
•	Establish consistent spacing, font sizes, content widths, colours, buttons, and responsive behaviour.
•	Use appropriate loading skeletons and empty states.
•	Add page titles, meta descriptions, Open Graph metadata, canonical URLs, and semantic HTML.
•	Use accessible forms and keyboard navigation.
•	Add subtle, purposeful animation only where it improves the experience.
Acceptance criteria
•	All public routes work independently.
•	Navigation works on desktop and mobile.
•	The website is responsive.
•	Content is sourced from the profile or CMS.
•	The booking CTA works.
•	There are no broken links, fake testimonials, or fabricated credentials.
•	The visual result is premium, cohesive, and professional.
Do not implement payment or video functionality in this phase.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
