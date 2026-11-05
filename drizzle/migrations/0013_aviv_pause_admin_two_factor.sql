-- TEMPORARY: administrators sign in with a password alone during testing.
-- Safe to apply before the matching code is deployed, because the earlier code still asks for two-factor.
-- Before real clients use the site, restore the check in a new migration by adding this to has_role:
--   AND (_role<>'admin' OR coalesce(auth.jwt()->>'aal','')='aal2')
-- and set ADMIN_TWO_FACTOR_REQUIRED to true in src/lib/aviv/admin-policy.ts.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.active) $$;
