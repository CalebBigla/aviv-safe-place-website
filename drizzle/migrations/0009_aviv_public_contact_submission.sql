-- Migration 0009: public contact submission function
-- Allows anon callers to insert contact submissions via a SECURITY DEFINER RPC,
-- removing the need for the service role key in the public-facing server function.
-- Rate limiting buckets are also managed within the same function.

CREATE OR REPLACE FUNCTION public.aviv_submit_contact(
  _name    text,
  _email   text,
  _subject text,
  _message text,
  _bucket1 text,   -- hashed IP bucket key
  _bucket2 text    -- hashed email bucket key
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _allowed boolean;
BEGIN
  -- Validate inputs (mirror contact_schema)
  IF _name    IS NULL OR length(trim(_name))    < 1 OR length(_name)    > 100 THEN RETURN '{"ok":false,"reason":"invalid"}'::jsonb; END IF;
  IF _email   IS NULL OR length(trim(_email))   < 1 OR length(_email)   > 255 THEN RETURN '{"ok":false,"reason":"invalid"}'::jsonb; END IF;
  IF _subject IS NULL OR length(trim(_subject)) < 1 OR length(_subject) > 150 THEN RETURN '{"ok":false,"reason":"invalid"}'::jsonb; END IF;
  IF _message IS NULL OR length(trim(_message)) < 1 OR length(_message) > 2000 THEN RETURN '{"ok":false,"reason":"invalid"}'::jsonb; END IF;

  -- Rate-limit bucket 1 (per-client IP hash)
  SELECT aviv_consume_rate_limit(_bucket1, 5, 3600) INTO _allowed;
  IF NOT _allowed THEN RETURN '{"ok":false,"reason":"rate_limited"}'::jsonb; END IF;

  -- Rate-limit bucket 2 (per-email hash)
  SELECT aviv_consume_rate_limit(_bucket2, 3, 3600) INTO _allowed;
  IF NOT _allowed THEN RETURN '{"ok":false,"reason":"rate_limited"}'::jsonb; END IF;

  INSERT INTO public.contact_submissions(name, email, subject, message)
  VALUES (trim(_name), trim(_email), trim(_subject), trim(_message));

  RETURN '{"ok":true}'::jsonb;
END;
$$;

-- Revoke from public/anon/authenticated (default grants), then grant only what's needed.
REVOKE ALL ON FUNCTION public.aviv_submit_contact(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aviv_submit_contact(text,text,text,text,text,text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aviv_submit_contact(text,text,text,text,text,text) TO anon, authenticated, service_role;
