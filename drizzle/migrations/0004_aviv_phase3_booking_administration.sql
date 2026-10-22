ALTER TABLE public.bookings ADD COLUMN reviewed_at timestamptz;
CREATE INDEX bookings_status_start_idx ON public.bookings(booking_status,confirmed_start);
CREATE FUNCTION public.aviv_booking_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF; RETURN (SELECT jsonb_build_object('new_requests',count(*) FILTER(WHERE booking_status='pending' AND reviewed_at IS NULL),'awaiting_confirmation',count(*) FILTER(WHERE payment_status='successful' AND booking_status IN ('pending','reschedule_requested')),'upcoming',count(*) FILTER(WHERE booking_status='confirmed' AND confirmed_start>now()),'completed',count(*) FILTER(WHERE booking_status='completed'),'payment_attention',count(*) FILTER(WHERE payment_status IN ('pending','failed') AND booking_status<>'cancelled'),'refund_attention',count(*) FILTER(WHERE refund_status='review_required')) FROM public.bookings); END $$;
REVOKE ALL ON FUNCTION public.aviv_booking_metrics() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_booking_metrics() TO authenticated,service_role;
CREATE FUNCTION public.aviv_admin_booking_action(_id uuid,_action text,_expected_updated_at timestamptz,_start timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE b public.bookings; duration integer; finish timestamptz; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
PERFORM pg_advisory_xact_lock(7312403);
SELECT * INTO b FROM public.bookings WHERE id=_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
IF b.updated_at<>_expected_updated_at THEN RAISE EXCEPTION 'Booking changed. Refresh and try again.'; END IF;
IF _action IN ('review','confirm','propose') THEN
IF b.payment_status<>'successful' OR b.booking_status NOT IN ('pending','reschedule_requested','confirmed') THEN RAISE EXCEPTION 'Only paid active requests may be reviewed or scheduled'; END IF;
END IF;
IF _action IN ('confirm','propose') THEN
IF _start IS NULL OR _start<=now() THEN RAISE EXCEPTION 'Choose a future appointment time'; END IF;
SELECT duration_minutes INTO duration FROM public.services WHERE id=b.service_id;
IF duration IS NULL OR duration<=0 THEN RAISE EXCEPTION 'Service duration is unavailable'; END IF;
finish=_start+make_interval(mins=>duration);
IF _action='confirm' AND EXISTS(SELECT 1 FROM public.bookings WHERE id<>b.id AND booking_status='confirmed' AND confirmed_start<finish AND confirmed_end>_start) THEN RAISE EXCEPTION 'This time overlaps another confirmed appointment'; END IF;
END IF;
CASE _action
WHEN 'review' THEN UPDATE public.bookings SET reviewed_at=now() WHERE id=b.id;
WHEN 'confirm' THEN
IF b.booking_status='confirmed' AND b.confirmed_start IS NOT DISTINCT FROM _start THEN RAISE EXCEPTION 'Appointment is already confirmed'; END IF;
UPDATE public.bookings SET confirmed_start=_start,confirmed_end=finish,confirmed_at=now(),booking_status='confirmed',reviewed_at=coalesce(reviewed_at,now()),session_status='not_started',daily_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'propose' THEN
UPDATE public.bookings SET alternative_start=_start,booking_status='reschedule_requested',confirmed_start=NULL,confirmed_end=NULL,confirmed_at=NULL,daily_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL,session_status='not_started' WHERE id=b.id;
UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'cancel' THEN
IF b.booking_status NOT IN ('pending','confirmed','reschedule_requested') THEN RAISE EXCEPTION 'This booking cannot be cancelled'; END IF;
UPDATE public.bookings SET booking_status='cancelled',cancellation_status='admin_cancelled',session_status='ended',daily_room_id=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND revoked_at IS NULL;
WHEN 'refund_review' THEN
IF b.payment_status<>'successful' OR b.refund_status IS NOT DISTINCT FROM 'review_required' THEN RAISE EXCEPTION 'A paid booking without a pending review is required'; END IF;
UPDATE public.bookings SET refund_status='review_required' WHERE id=b.id;
WHEN 'complete' THEN
IF b.booking_status<>'confirmed' OR b.confirmed_end IS NULL OR b.confirmed_end>now() THEN RAISE EXCEPTION 'Only a confirmed appointment that has ended may be completed'; END IF;
UPDATE public.bookings SET booking_status='completed',session_status='ended' WHERE id=b.id;
UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
ELSE RAISE EXCEPTION 'Unsupported booking action'; END CASE;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),_action,'bookings',b.id::text,jsonb_build_object('previous_status',b.booking_status,'previous_start',b.confirmed_start,'proposed_start',_start));
END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_booking_action(uuid,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_booking_action(uuid,text,timestamptz,timestamptz) TO authenticated,service_role;