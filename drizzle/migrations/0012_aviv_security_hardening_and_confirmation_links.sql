-- Security hardening and emailed session links.
-- Deploy the matching application code BEFORE applying this migration: administrators need the
-- two-factor sign-in screen, and the app must already call these functions through the server.

-- Administrator rights now require a two-factor session, enforced in the database so that a stolen
-- password can't read private rows by calling the Supabase API directly.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.active)
    AND (_role<>'admin' OR coalesce(auth.jwt()->>'aal','')='aal2') $$;

-- The contact form trusted caller-supplied rate-limit keys, so anyone with the public key could
-- bypass the limit by calling it directly. It is now reachable only through the server.
REVOKE ALL ON FUNCTION public.aviv_submit_contact(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aviv_submit_contact(text,text,text,text,text,text) TO service_role;

-- Availability is rate limited in the server, which is pointless if the API can be called directly.
REVOKE ALL ON FUNCTION public.aviv_slot_availability(date,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aviv_slot_availability(date,date,integer) TO service_role;

-- Booking-page entry no longer revokes earlier links, so opening the room from the booking page
-- can't break the link the client was emailed. The fixed client uid still allows only one client
-- in the room, and moving, cancelling or completing the appointment revokes every link.
CREATE OR REPLACE FUNCTION public.aviv_issue_session_link(_manage_hash text,_session_hash text,_client_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; room jsonb; miss text:='guest-miss:'||left(coalesce(_client_key,'unknown'),100); BEGIN
IF NOT public.aviv_consume_rate_limit('session-issue:'||left(coalesce(_client_key,'unknown'),100),60,3600) OR public.aviv_rate_limit_exceeded(miss,20,3600) THEN RETURN jsonb_build_object('state','rate_limited'); END IF;
IF coalesce(_session_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'AVIV_INVALID_DETAILS'; END IF;
IF coalesce(_manage_hash,'') ~ '^[a-f0-9]{64}$' THEN
  SELECT t.booking_id INTO booking FROM public.booking_access_tokens t WHERE t.token_hash=_manage_hash AND t.purpose='manage' AND t.revoked_at IS NULL AND t.expires_at>now();
END IF;
IF booking IS NULL THEN PERFORM public.aviv_consume_rate_limit(miss,20,3600); RETURN jsonb_build_object('state','unavailable'); END IF;
room:=public.aviv_session_room(booking);
IF room->>'state'='open' THEN
  INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES(booking,_session_hash,'session',(room->>'closes_at')::timestamptz);
  UPDATE public.bookings SET meeting_link_issued_at=now() WHERE id=booking;
  INSERT INTO public.audit_logs(action,resource_type,resource_id) VALUES('session_link_issued','bookings',booking::text);
END IF;
RETURN room-'room'-'service'-'start'-'end'-'closes_at'; END $$;

-- Creates the session link for a confirmation email and returns only what the email needs. The link
-- works from now until the room closes; the session page shows a waiting state until the room opens.
CREATE FUNCTION public.aviv_admin_confirmation_link(_id uuid,_session_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; closes timestamptz; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
IF coalesce(_session_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid session link'; END IF;
SELECT * INTO b FROM public.bookings WHERE id=_id FOR UPDATE;
IF NOT FOUND OR b.booking_status<>'confirmed' OR b.payment_status<>'successful' OR b.confirmed_start IS NULL OR b.confirmed_end IS NULL THEN RAISE EXCEPTION 'Only a confirmed, paid appointment can be emailed'; END IF;
closes:=b.confirmed_end+interval '15 minutes';
IF closes<=now() THEN RAISE EXCEPTION 'This appointment has already ended'; END IF;
INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES(b.id,_session_hash,'session',closes);
RETURN jsonb_build_object('name',b.client_name,'email',b.client_email,'start',b.confirmed_start,'end',b.confirmed_end); END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_confirmation_link(uuid,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_confirmation_link(uuid,text) TO authenticated,service_role;

-- Records whether a confirmation email went out. State only: never the address, link or content.
CREATE FUNCTION public.aviv_admin_record_confirmation_email(_id uuid,_sent boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id) VALUES(auth.uid(),CASE WHEN _sent THEN 'confirmation_email_sent' ELSE 'confirmation_email_failed' END,'bookings',_id::text); END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_record_confirmation_email(uuid,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_record_confirmation_email(uuid,boolean) TO authenticated,service_role;
