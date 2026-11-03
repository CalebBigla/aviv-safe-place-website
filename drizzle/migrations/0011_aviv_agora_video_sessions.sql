-- AVIV video sessions on Agora: one private two-person room per confirmed, paid appointment.
-- The database decides who may enter and when. RTC tokens are minted by the server only after
-- these functions agree, and rooms open 15 minutes before the start and close 15 minutes after the end.

ALTER TABLE public.bookings RENAME COLUMN daily_room_id TO meeting_room_id;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_meeting_room_shape CHECK (meeting_room_id IS NULL OR meeting_room_id ~ '^aviv-[a-f0-9]{32}$');

-- Same behaviour as 0008 with the renamed column: moving, cancelling or completing an appointment clears the room and revokes session links.
CREATE OR REPLACE FUNCTION public.aviv_admin_booking_action(_id uuid,_action text,_expected_updated_at timestamptz,_start timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE b public.bookings; duration integer; finish timestamptz; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
SELECT * INTO b FROM public.bookings WHERE id=_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
IF b.updated_at<>_expected_updated_at THEN RAISE EXCEPTION 'Booking changed. Refresh and try again.'; END IF;
duration:=coalesce(b.duration_minutes_snapshot,(SELECT duration_minutes FROM public.services WHERE id=b.service_id));
IF _action IN ('review','confirm','propose') AND (b.payment_status<>'successful' OR b.booking_status NOT IN ('pending','reschedule_requested','confirmed')) THEN RAISE EXCEPTION 'Only paid active requests may be reviewed or scheduled'; END IF;
IF _action IN ('confirm','propose') THEN
  IF _start IS NULL OR _start<=now() THEN RAISE EXCEPTION 'Choose a future appointment time'; END IF;
  IF duration IS NULL OR duration NOT IN (30,60) THEN RAISE EXCEPTION 'Service duration is unavailable'; END IF;
  IF NOT public.aviv_slot_valid(_start,duration) THEN RAISE EXCEPTION 'Choose a time within the AVIV schedule'; END IF;
  finish:=_start+make_interval(mins=>duration);
  IF EXISTS(SELECT 1 FROM public.booking_blocks WHERE period && tstzrange(_start,finish)) THEN RAISE EXCEPTION 'This time is blocked'; END IF;
  IF _action='confirm' AND EXISTS(SELECT 1 FROM public.bookings WHERE id<>b.id AND slot && tstzrange(_start,finish)) THEN RAISE EXCEPTION 'This time overlaps another confirmed appointment'; END IF;
END IF;
CASE _action
WHEN 'review' THEN UPDATE public.bookings SET reviewed_at=now() WHERE id=b.id;
WHEN 'confirm' THEN
  IF b.booking_status='confirmed' AND b.confirmed_start IS NOT DISTINCT FROM _start THEN RAISE EXCEPTION 'Appointment is already confirmed'; END IF;
  BEGIN
    UPDATE public.bookings SET confirmed_start=_start,confirmed_end=finish,confirmed_at=now(),booking_status='confirmed',reviewed_at=coalesce(reviewed_at,now()),duration_minutes_snapshot=duration,slot=tstzrange(_start,finish),session_status='not_started',meeting_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'This time overlaps another confirmed appointment'; END;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'propose' THEN
  -- The current slot stays reserved until a new time is confirmed or the booking is cancelled.
  UPDATE public.bookings SET alternative_start=_start,booking_status='reschedule_requested',confirmed_start=NULL,confirmed_end=NULL,confirmed_at=NULL,meeting_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL,session_status='not_started' WHERE id=b.id;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'cancel' THEN
  IF b.booking_status NOT IN ('pending','confirmed','reschedule_requested') THEN RAISE EXCEPTION 'This booking cannot be cancelled'; END IF;
  UPDATE public.bookings SET booking_status='cancelled',cancellation_status='admin_cancelled',slot=NULL,session_status='ended',meeting_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
  -- The manage link stays valid so the guest can see the cancellation; session access is revoked.
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'refund_review' THEN
  IF b.payment_status<>'successful' OR b.refund_status IS NOT DISTINCT FROM 'review_required' THEN RAISE EXCEPTION 'A paid booking without a pending review is required'; END IF;
  UPDATE public.bookings SET refund_status='review_required' WHERE id=b.id;
WHEN 'complete' THEN
  IF b.booking_status<>'confirmed' OR b.confirmed_end IS NULL OR b.confirmed_end>now() THEN RAISE EXCEPTION 'Only a confirmed appointment that has ended may be completed'; END IF;
  UPDATE public.bookings SET booking_status='completed',session_status='ended',slot=NULL,meeting_room_id=NULL WHERE id=b.id;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
ELSE RAISE EXCEPTION 'Unsupported booking action'; END CASE;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),_action,'bookings',b.id::text,jsonb_build_object('previous_status',b.booking_status,'previous_start',b.confirmed_start,'proposed_start',_start));
END $$;

-- Internal: the single rule for whether a booking's room is open, creating the room on first entry.
-- The room name is random and carries no client details. Reads that find a room do not touch the
-- booking, so token renewal during a session cannot disturb the administrators' optimistic lock.
CREATE FUNCTION public.aviv_session_room(_booking uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; opens timestamptz; closes timestamptz; BEGIN
SELECT * INTO b FROM public.bookings WHERE id=_booking FOR UPDATE;
IF NOT FOUND OR b.booking_status<>'confirmed' OR b.payment_status<>'successful' OR b.confirmed_start IS NULL OR b.confirmed_end IS NULL THEN RETURN jsonb_build_object('state','unavailable'); END IF;
opens:=b.confirmed_start-interval '15 minutes';
closes:=b.confirmed_end+interval '15 minutes';
IF now()<opens THEN RETURN jsonb_build_object('state','early','opens_at',opens); END IF;
IF now()>=closes THEN RETURN jsonb_build_object('state','ended'); END IF;
IF b.meeting_room_id IS NULL THEN
  b.meeting_room_id:='aviv-'||replace(gen_random_uuid()::text,'-','');
  UPDATE public.bookings SET meeting_room_id=b.meeting_room_id,meeting_provider='agora',session_status=CASE WHEN session_status='not_started' THEN 'ready' ELSE session_status END WHERE id=b.id;
END IF;
RETURN jsonb_build_object('state','open','room',b.meeting_room_id,'service',coalesce(b.service_title_snapshot,''),'start',b.confirmed_start,'end',b.confirmed_end,'closes_at',closes); END $$;
REVOKE ALL ON FUNCTION public.aviv_session_room(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Guest entry (service role only): exchanges the manage link for a session link while the room is
-- open. Only the newest link works, so a booking has one guest seat. Link misses share the manage
-- link's guessing throttle.
CREATE FUNCTION public.aviv_issue_session_link(_manage_hash text,_session_hash text,_client_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; room jsonb; miss text:='guest-miss:'||left(coalesce(_client_key,'unknown'),100); BEGIN
IF NOT public.aviv_consume_rate_limit('session-issue:'||left(coalesce(_client_key,'unknown'),100),60,3600) OR public.aviv_rate_limit_exceeded(miss,20,3600) THEN RETURN jsonb_build_object('state','rate_limited'); END IF;
IF coalesce(_session_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'AVIV_INVALID_DETAILS'; END IF;
IF coalesce(_manage_hash,'') ~ '^[a-f0-9]{64}$' THEN
  SELECT t.booking_id INTO booking FROM public.booking_access_tokens t WHERE t.token_hash=_manage_hash AND t.purpose='manage' AND t.revoked_at IS NULL AND t.expires_at>now();
END IF;
IF booking IS NULL THEN PERFORM public.aviv_consume_rate_limit(miss,20,3600); RETURN jsonb_build_object('state','unavailable'); END IF;
room:=public.aviv_session_room(booking);
IF room->>'state'='open' THEN
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=booking AND purpose='session' AND revoked_at IS NULL;
  INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES(booking,_session_hash,'session',(room->>'closes_at')::timestamptz);
  UPDATE public.bookings SET meeting_link_issued_at=now() WHERE id=booking;
  INSERT INTO public.audit_logs(action,resource_type,resource_id) VALUES('session_link_issued','bookings',booking::text);
END IF;
RETURN room-'room'-'service'-'start'-'end'-'closes_at'; END $$;
REVOKE ALL ON FUNCTION public.aviv_issue_session_link(text,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_issue_session_link(text,text,text) TO service_role;

-- Guest room access by session-link hash (service role only). Called on entry and on every token renewal.
CREATE FUNCTION public.aviv_read_session_access(_hash text,_client_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; room jsonb; miss text:='guest-miss:'||left(coalesce(_client_key,'unknown'),100); BEGIN
IF NOT public.aviv_consume_rate_limit('session-read:'||left(coalesce(_client_key,'unknown'),100),120,3600) OR public.aviv_rate_limit_exceeded(miss,20,3600) THEN RETURN jsonb_build_object('state','rate_limited'); END IF;
IF coalesce(_hash,'') ~ '^[a-f0-9]{64}$' THEN
  SELECT t.booking_id INTO booking FROM public.booking_access_tokens t WHERE t.token_hash=_hash AND t.purpose='session' AND t.revoked_at IS NULL AND t.expires_at>now();
END IF;
IF booking IS NULL THEN PERFORM public.aviv_consume_rate_limit(miss,20,3600); RETURN jsonb_build_object('state','unavailable'); END IF;
room:=public.aviv_session_room(booking);
IF room->>'state'='open' THEN UPDATE public.booking_access_tokens SET redeemed_at=now() WHERE token_hash=_hash AND redeemed_at IS NULL; END IF;
RETURN room; END $$;
REVOKE ALL ON FUNCTION public.aviv_read_session_access(text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_read_session_access(text,text) TO service_role;

-- Administrator room access, role-checked here as well as in the server function. Each administrator's first entry to a session is audited once.
CREATE FUNCTION public.aviv_admin_session_access(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE room jsonb; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
room:=public.aviv_session_room(_id);
IF room->>'state'='open' AND NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='session_opened' AND resource_type='bookings' AND resource_id=_id::text AND actor_id=auth.uid() AND created_at>=(room->>'start')::timestamptz-interval '15 minutes') THEN
  INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id) VALUES(auth.uid(),'session_opened','bookings',_id::text);
END IF;
RETURN room; END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_session_access(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_session_access(uuid) TO authenticated,service_role;
