REVOKE EXECUTE ON FUNCTION public.consume_contact_limit(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_contact_limit(text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;