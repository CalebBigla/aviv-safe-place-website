> **Superseded (October 2026).** This analysis predates the booking foundation phase and is kept for history only. Several points are outdated or incorrect: CMS text is rendered as React text nodes (no HTML), so the reported EditorialContent XSS risk does not exist; the schedule, 30-minute grid, holds and rate limiting are now implemented and tested. See README.md.

# AVIV Safe Place - Pre-Integration Test Phase Analysis

Based on code inspection of the AVIV Safe Place website, this document provides analysis and guidance for the pre-integration test phase as outlined in the requirements. Since live testing cannot be performed due to environment constraints, this analysis focuses on:

1. Code inspection findings
2. Potential issues identified
3. Detailed test procedures for manual verification
4. Recommendations for addressing findings

## Code Inspection Findings

### Public Website
- Routes implemented: `/`, `/services`, `/about`, `/contact`, `/book`, `/booking/success`, `/booking/manage/:token`, `/session/:token`
- Public content is fetched via Supabase using publishable key (client-side)
- Content includes services, pages, FAQs, and settings
- Empty states are handled appropriately (e.g., when no services are published)
- Navigation is consistent across pages with proper mobile responsiveness considerations

### CMS/Admin Functionality
- Admin routes protected by Supabase authentication and role checking (`has_role` RPC)
- CMS covers: services, pages, FAQs, public settings, media assets
- Validation schemas present for all CMS entities (admin-schema.ts)
- Server-side authorization middleware checks user role before allowing operations
- Media upload includes file type validation (JPEG, PNG, WebP) and size limits (5MB)
- Content updates use upsert operations with proper error handling

### Booking System
- Guest booking flow implemented (service selection, date/time input, policy acceptance)
- Booking validation includes:
  - Service slug validation
  - Name/email/phone validation
  - Date/time validation (must be future, within 180 days)
  - Policy acceptance requirement (checkbox must be checked)
- Submission currently returns "Online checkout is not open yet" (intentional for this phase)
- Uses server functions for submission with input validation
- Guest token system implemented for secure access to booking details (64-char hex tokens)

### Security Features
- Row Level Security (RLS) implied through separation of client/publishable key vs service role
- Admin operations require Supabase authentication + role verification
- Guest tokens are SHA-256 hashes of random values (64-character hex)
- Token consumption limiting via RPC (`consume_contact_limit`)
- Payment processing is deliberately disabled (fail-closed) until Paystack integration
- No sensitive data exposure in client-side code

### Technical Implementation
- Uses TanStack Start for routing and data fetching
- React Query for client-side caching and state management
- Supabase client properly configured for both public (publishable key) and admin (service role) operations
- Environment variables properly separated (client vs server only)
- Proper error handling throughout (try/catch blocks, error propagation)
- Loading states and empty states considered in UI components

## Potential Issues Identified

### 1. Content Sanitization
- In `aviv-site.tsx`, the `EditorialContent` component renders page body content directly:
  ```typescript
  ['privacy','terms','cancellation-policy'].includes(slug) ? 
    page.body.split(/\n\s*\n/).map(...) : 
    page.body
  ```
  This could potentially allow XSS if HTML-containing content is stored in the database without sanitization.

### 2. Guest Token Security
- While tokens are 64-character hex strings (appears secure), need to verify:
  - Entropy source for token generation
  - Expiration mechanism
  - Rate limiting on token validation endpoints
  - Whether tokens are invalidated after use or expiration

### 3. Booking Availability Logic
- Need to verify that the 30-minute grid and Africa/Lagos timezone are properly implemented
- Currently, the booking form uses `<input type="datetime-local">` which relies on user's local timezone
- No visible server-side validation of the 30-minute grid constraint in the inspected code

### 4. Error Message Exposure
- Some error messages might expose internal details:
  - In `guest-booking.functions.ts`: "Choose a future preferred and alternative time within the next 180 days."
  - While helpful, ensure no stack traces or database details are exposed in production

### 5. Admin Authorization Depth
- Verify that all admin API endpoints properly check:
  - Authentication status
  - Admin role authorization
  - That RLS policies cannot be bypassed by client-side manipulation

## Recommended Test Procedures

Given the constraints preventing live testing, here's how to manually verify each requirement:

### 1. Public Website Audit
- Manually inspect each route file in `src/routes/`
- Verify content comes from CMS by checking:
  - `contentQuery` usage in route loaders
  - `getPublicContent` function implementation
  - That only published/active content is queried
- Check for hardcoded content that should come from CMS
- Verify navigation consistency across all route files

### 2. CMS Audit
- Test admin functions by examining:
  - `admin.functions.ts` for proper validation and error handling
  - `admin-schema.ts` for field constraints
  - Media upload validation (file types, size limits)
  - Ensure all CRUD operations have corresponding server functions
- Verify that changes persist by checking:
  - Database update/insert operations
  - Proper error handling and validation
  - Cache invalidation patterns

### 3. CMS Security
- Focus on:
  - `EditorialContent` component in `aviv-site.tsx`
  - Verify if any HTML sanitization occurs before storage/display
  - Check that dangerous attributes/scripts would be escaped
  - Test with sample malicious content patterns

### 4. Admin Authorization
- Verify:
  - `requireSupabaseAuth` middleware implementation
  - Role checking in `authorise` function (`has_role` RPC)
  - That all admin routes use the middleware
  - Client-side route protection mirrors server-side checks

### 5. Booking Availability
- Examine:
  - Time validation logic in `guest-booking-schema.ts` (`validRequestedTime` function)
  - Server-side validation in `guest-booking.functions.ts`
  - Check for 30-minute grid enforcement (may need to look at database level)
  - Africa/Lagos timezone consistency

### 6. Guest Booking Security
- Review:
  - Token generation in `guest-booking.functions.ts` (SHA-256 hash)
  - Token consumption limiting via `consume_contact_limit` RPC
  - Validation schema in `guest-booking-schema.ts`
  - Error handling for invalid/expired tokens

### 7. Error Handling
- Check that:
  - Error messages are user-friendly but don't expose internals
  - Stack traces are caught and logged server-side only
  - No SQL/database details in client-visible errors
  - Proper HTTP status codes are used

### 8. Accessibility
- Manually inspect JSX for:
  - Proper labeling of form elements
  - Semantic HTML usage
  - Keyboard-navigable components
  - ARIA attributes where needed
  - Color contrast in Tailwind classes (would need visual verification)

### 9. Security Regression
- Focus on:
  - XSS vectors in content rendering
  - Authorization bypass possibilities
  - RLS configuration (would need to check Supabase policies)
  - Guest token predictability
  - IDOR vulnerabilities in booking access endpoints

## Specific Code Areas to Review

### Content Rendering Safety
File: `src/components/aviv-site.tsx`
Function: `EditorialContent` (lines 292-300)
Concern: Direct rendering of `page.body` without explicit sanitization

### Guest Token Handling
File: `src/lib/aviv/guest-booking.functions.ts`
Functions: `readGuestBooking`, token hashing mechanism
Concern: Verify entropy source and expiration

### Booking Validation
Files:
- `src/lib/aviv/guest-booking-schema.ts` (validation schema)
- `src/lib/aviv/guest-booking.functions.ts` (submission validation)
Concerns: 30-minute grid enforcement, timezone consistency

### Media Upload Security
File: `src/lib/aviv/admin.functions.ts`
Function: `uploadMedia` (lines 58-73)
Concerns: File type validation, size limits, path traversal

### Admin Authorization
Files:
- `src/integrations/supabase/auth-middleware.ts` (auth middleware)
- `src/lib/aviv/admin.functions.ts` (authorise function)
Concerns: Proper role checking, middleware application

## Recommendations

### Immediate Actions (Before Paystack/Daily.co Integration)
1. **Content Sanitization**: Implement HTML sanitization for CMS content before rendering
   - Consider using a library like `dompurify` or similar
   - Or restrict CMS content to plain text with limited formatting options

2. **Booking Grid Validation**: Ensure 30-minute grid enforcement is implemented
   - Preferably at database level with constraints/triggers
   - Or validate server-side before accepting bookings

3. **Token Security Review**:
   - Verify token generation uses cryptographically secure random values
   - Confirm appropriate expiration and consumption limits
   - Ensure tokens cannot be guessed or brute-forced

4. **Error Message Review**:
   - Ensure all user-facing errors are helpful but don't leak internals
   - Implement global error handler to catch and sanitize unexpected errors

5. **Accessibility Audit**:
   - Manual verification of keyboard navigation
   - Form labeling and validation feedback
   - Color contrast ratios
   - Screen reader compatibility

### Testing Procedure Summary
For manual testing, create a checklist covering:
1. Public page content accuracy and CMS sourcing
2. Admin CRUD operations for all content types
3. Media upload restrictions and validation
4. Booking form validation and error handling
5. Admin authorization boundaries
6. Error states and messaging
7. Responsive behavior at breakpoints
8. Loading and empty states

This analysis provides a foundation for the pre-integration test phase. Actual testing would require:
1. Setting up a local development environment
2. Creating test administrator accounts
3. Populating test data in CMS
4. Performing the manual test procedures outlined above
5. Documenting findings and fixing any issues before proceeding to Paystack/Daily.co integration