// TEMPORARY: two-factor is off during testing, so administrators sign in with a password alone.
// Before real clients use the site, set this to true AND restore the database check: see migration
// 0013, which public.has_role must be returned from.
export const ADMIN_TWO_FACTOR_REQUIRED = false;
