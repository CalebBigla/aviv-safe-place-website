-- AVIV booking foundation: fixed Africa/Lagos schedule, 30/60-minute sessions, expiring
-- slot holds, database-enforced no-overlap, blocked periods, bounded rate limiting.
-- Every scheduling write takes advisory lock 7312403 (shared with admin actions).

-- Least privilege: hosted Supabase grants ALL on new public tables to the API roles by default,
-- which earlier migrations never revoked. RLS already blocked these writes; grants now match intent.
REVOKE ALL ON public.user_roles, public.rate_limit_buckets FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
REVOKE ALL ON public.services, public.pages, public.faqs, public.public_settings, public.media_assets FROM anon, authenticated;
GRANT SELECT ON public.services, public.pages, public.faqs, public.public_settings, public.media_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services, public.pages, public.faqs, public.public_settings, public.media_assets TO authenticated;

-- Schedule: Mon & Wed 10:00-13:00, Sat 10:00-15:00 Africa/Lagos, 30-minute grid.
-- Starts run from 10:00 to one hour before closing (12:00 weekdays, 14:00 Saturday) and the session must end by closing.
CREATE FUNCTION public.aviv_slot_valid(_start timestamptz, _minutes integer) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT coalesce(_start IS NOT NULL AND _minutes IN (30,60) AND extract(second FROM t)=0 AND m % 30 = 0 AND m >= 600
    AND m <= close-60 AND m + _minutes <= close, false)
  FROM (SELECT _start AT TIME ZONE 'Africa/Lagos' AS t) l,
  LATERAL (SELECT (extract(hour FROM l.t)*60 + extract(minute FROM l.t))::int AS m,
                  CASE extract(isodow FROM l.t)::int WHEN 1 THEN 780 WHEN 3 THEN 780 WHEN 6 THEN 900 ELSE 0 END AS close) x
$$;
GRANT EXECUTE ON FUNCTION public.aviv_slot_valid(timestamptz,integer) TO anon,authenticated,service_role;

-- Only 30 and 60 minute services can be saved from now on (NOT VALID leaves legacy rows for the admin to correct).
ALTER TABLE public.services ADD CONSTRAINT services_supported_duration CHECK (duration_minutes IS NULL OR duration_minutes IN (30,60)) NOT VALID;

-- Booking lifecycle: 'expired' marks an unpaid hold that lapsed.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_booking_status_check CHECK (booking_status IN ('pending','confirmed','cancelled','completed','reschedule_requested','expired'));
ALTER TABLE public.bookings ADD CONSTRAINT bookings_duration_snapshot CHECK (duration_minutes_snapshot IS NULL OR duration_minutes_snapshot IN (30,60)) NOT VALID;

-- slot is the time a booking currently claims (a hold or an appointment); NULL once released.
ALTER TABLE public.bookings ADD COLUMN slot tstzrange;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_slot_shape CHECK (slot IS NULL OR (booking_status IN ('pending','confirmed','reschedule_requested') AND lower_inc(slot) AND NOT upper_inc(slot) AND upper(slot)-lower(slot) IN (interval '30 minutes', interval '60 minutes')));
UPDATE public.bookings SET slot=tstzrange(confirmed_start,confirmed_end) WHERE booking_status='confirmed' AND confirmed_end>now() AND confirmed_end-confirmed_start IN (interval '30 minutes', interval '60 minutes');
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap EXCLUDE USING gist (slot WITH &&);
CREATE INDEX bookings_pending_email_idx ON public.bookings(client_email) WHERE booking_status='pending';

-- Price, service, title and duration snapshots are immutable once set.
CREATE OR REPLACE FUNCTION public.aviv_booking_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF TG_OP='UPDATE' AND (NEW.price_minor<>OLD.price_minor OR NEW.currency<>OLD.currency OR NEW.service_id<>OLD.service_id
  OR (OLD.duration_minutes_snapshot IS NOT NULL AND NEW.duration_minutes_snapshot IS DISTINCT FROM OLD.duration_minutes_snapshot)
  OR (OLD.service_title_snapshot IS NOT NULL AND NEW.service_title_snapshot IS DISTINCT FROM OLD.service_title_snapshot)) THEN RAISE EXCEPTION 'Booking price snapshot is immutable'; END IF;
IF NEW.time_zone<>'Africa/Lagos' AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.time_zone) THEN RAISE EXCEPTION 'Invalid time zone'; END IF;
NEW.updated_at=now(); RETURN NEW; END $$;

-- Administrative closures (holidays, leave, one-off unavailability). The reason is internal only.
CREATE TABLE public.booking_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period tstzrange NOT NULL CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period) AND NOT lower_inf(period) AND NOT upper_inf(period) AND upper(period)-lower(period)<=interval '366 days'), reason text NOT NULL DEFAULT '' CHECK (length(reason)<=200), created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.booking_blocks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.booking_blocks TO authenticated; GRANT ALL ON public.booking_blocks TO service_role;
ALTER TABLE public.booking_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_block_read ON public.booking_blocks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX booking_blocks_period_idx ON public.booking_blocks USING gist (period);

-- Bounded fixed-window rate limiting. Keys are scoped hashes (never raw tokens or IPs); stale rows are pruned on use.
CREATE INDEX IF NOT EXISTS rate_limit_window_idx ON public.rate_limit_buckets(window_start);
CREATE FUNCTION public.aviv_consume_rate_limit(_bucket text,_limit integer,_window_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; BEGIN
IF _bucket IS NULL OR length(_bucket)>200 OR _limit<1 OR _window_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'Invalid rate limit'; END IF;
DELETE FROM public.rate_limit_buckets WHERE key IN (SELECT key FROM public.rate_limit_buckets WHERE window_start<now()-interval '1 day' LIMIT 100);
INSERT INTO public.rate_limit_buckets(key) VALUES(_bucket) ON CONFLICT(key) DO UPDATE SET
  attempts=CASE WHEN rate_limit_buckets.window_start<now()-make_interval(secs=>_window_seconds) THEN 1 ELSE rate_limit_buckets.attempts+1 END,
  window_start=CASE WHEN rate_limit_buckets.window_start<now()-make_interval(secs=>_window_seconds) THEN now() ELSE rate_limit_buckets.window_start END
RETURNING attempts INTO n; RETURN n<=_limit; END $$;
REVOKE ALL ON FUNCTION public.aviv_consume_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_consume_rate_limit(text,integer,integer) TO service_role;
CREATE FUNCTION public.aviv_rate_limit_exceeded(_bucket text,_limit integer,_window_seconds integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.rate_limit_buckets WHERE key=_bucket AND attempts>=_limit AND window_start>=now()-make_interval(secs=>_window_seconds)) $$;
REVOKE ALL ON FUNCTION public.aviv_rate_limit_exceeded(text,integer,integer) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_rate_limit_exceeded(text,integer,integer) TO service_role;

-- Unpaid holds lapse at request_expires_at. Called inside every scheduling transaction.
CREATE FUNCTION public.aviv_expire_stale_holds() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; BEGIN
UPDATE public.bookings SET booking_status='expired', slot=NULL WHERE booking_status='pending' AND payment_status IN ('pending','failed') AND request_expires_at<=now();
GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.aviv_expire_stale_holds() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_expire_stale_holds() TO service_role;

-- Public availability: times and an availability flag only; never booking details.
CREATE FUNCTION public.aviv_slot_availability(_from date,_to date,_minutes integer) RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, available boolean, reason text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.s, c.e, r.reason IS NULL, r.reason
  FROM (SELECT x.s, x.s+make_interval(mins=>_minutes) AS e
        FROM generate_series(_from::timestamp,_to::timestamp,interval '1 day') d, generate_series(0,9) n,
             LATERAL (SELECT (d+make_interval(mins=>600+30*n)) AT TIME ZONE 'Africa/Lagos' AS s) x
        WHERE _minutes IN (30,60) AND _to>=_from AND _to-_from<=62 AND public.aviv_slot_valid(x.s,_minutes)) c,
  LATERAL (SELECT CASE
    WHEN c.s<=now() THEN 'past'
    WHEN c.s>now()+interval '180 days' THEN 'outside_window'
    WHEN EXISTS(SELECT 1 FROM public.booking_blocks k WHERE k.period && tstzrange(c.s,c.e)) THEN 'blocked'
    WHEN EXISTS(SELECT 1 FROM public.bookings b WHERE b.slot && tstzrange(c.s,c.e) AND NOT (b.booking_status='pending' AND b.payment_status IN ('pending','failed') AND b.request_expires_at<=now())) THEN 'taken'
  END AS reason) r
  ORDER BY c.s $$;
REVOKE ALL ON FUNCTION public.aviv_slot_availability(date,date,integer) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.aviv_slot_availability(date,date,integer) TO anon,authenticated,service_role;

-- Guest hold creation (service role only). Rate limiting is consumed separately by the server so it survives a rejected request.
DROP FUNCTION IF EXISTS public.aviv_create_guest_request(text,text,text,text,timestamptz,timestamptz,text);
CREATE FUNCTION public.aviv_create_guest_request(_service_slug text,_name text,_email text,_phone text,_start timestamptz,_token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.services%ROWTYPE; b public.bookings%ROWTYPE; finish timestamptz; clean_email text:=lower(trim(_email)); BEGIN
SELECT * INTO s FROM public.services WHERE slug=_service_slug AND active AND published FOR SHARE;
IF NOT FOUND OR coalesce(s.price_minor,0)<=0 OR s.duration_minutes IS NULL OR s.duration_minutes NOT IN (30,60) THEN RAISE EXCEPTION 'AVIV_SERVICE_UNAVAILABLE'; END IF;
IF length(trim(coalesce(_name,''))) NOT BETWEEN 2 AND 100 OR length(clean_email)>254 OR clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(coalesce(_phone,''))>30 OR coalesce(_token_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'AVIV_INVALID_DETAILS'; END IF;
IF NOT public.aviv_slot_valid(_start,s.duration_minutes) OR _start>now()+interval '180 days' THEN RAISE EXCEPTION 'AVIV_SLOT_OUTSIDE_SCHEDULE'; END IF;
IF _start<=now() THEN RAISE EXCEPTION 'AVIV_SLOT_PAST'; END IF;
finish:=_start+make_interval(mins=>s.duration_minutes);
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
IF EXISTS(SELECT 1 FROM public.booking_blocks WHERE period && tstzrange(_start,finish)) THEN RAISE EXCEPTION 'AVIV_SLOT_UNAVAILABLE'; END IF;
IF (SELECT count(*) FROM public.bookings WHERE client_email=clean_email AND booking_status='pending' AND payment_status='pending' AND slot IS NOT NULL)>=2 THEN RAISE EXCEPTION 'AVIV_TOO_MANY_HOLDS'; END IF;
BEGIN
  INSERT INTO public.bookings(public_reference,client_name,client_email,client_phone,service_id,price_minor,currency,requested_start,time_zone,request_expires_at,service_title_snapshot,duration_minutes_snapshot,policy_acknowledged_at,slot)
  VALUES('AVIV-'||replace(gen_random_uuid()::text,'-',''),trim(_name),clean_email,nullif(trim(_phone),''),s.id,s.price_minor,s.currency,_start,'Africa/Lagos',now()+interval '30 minutes',s.title,s.duration_minutes,now(),tstzrange(_start,finish)) RETURNING * INTO b;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'AVIV_SLOT_UNAVAILABLE'; END;
INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES(b.id,_token_hash,'manage',finish+interval '30 days');
RETURN jsonb_build_object('reference',b.public_reference,'start',_start,'end',finish,'hold_expires_at',b.request_expires_at); END $$;
REVOKE ALL ON FUNCTION public.aviv_create_guest_request(text,text,text,text,timestamptz,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_create_guest_request(text,text,text,text,timestamptz,text) TO service_role;

-- Guest readback by manage-token hash (service role only). Misses are counted per client so
-- guessing is throttled while normal refreshes are not. Projects status only, no identity.
DROP FUNCTION IF EXISTS public.aviv_read_guest_booking(text);
CREATE FUNCTION public.aviv_read_guest_booking(_hash text,_client_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; miss text:='guest-miss:'||left(coalesce(_client_key,'unknown'),100); BEGIN
IF NOT public.aviv_consume_rate_limit('guest-read:'||left(coalesce(_client_key,'unknown'),100),300,3600) OR public.aviv_rate_limit_exceeded(miss,20,3600) THEN RETURN jsonb_build_object('rate_limited',true); END IF;
IF coalesce(_hash,'') ~ '^[a-f0-9]{64}$' THEN
  SELECT jsonb_build_object('reference',b.public_reference,'service',coalesce(b.service_title_snapshot,s.title),'price_minor',b.price_minor,'currency',b.currency,
    'duration_minutes',coalesce(b.duration_minutes_snapshot,s.duration_minutes),'requested_start',b.requested_start,'confirmed_start',b.confirmed_start,'confirmed_end',b.confirmed_end,
    'payment_status',b.payment_status,
    'booking_status',CASE WHEN b.booking_status='pending' AND b.payment_status IN ('pending','failed') AND b.request_expires_at<=now() THEN 'expired' ELSE b.booking_status END,
    'hold_expires_at',CASE WHEN b.booking_status='pending' AND b.payment_status='pending' THEN b.request_expires_at END,'time_zone',b.time_zone) INTO r
  FROM public.booking_access_tokens t JOIN public.bookings b ON b.id=t.booking_id JOIN public.services s ON s.id=b.service_id
  WHERE t.token_hash=_hash AND t.purpose='manage' AND t.revoked_at IS NULL AND t.expires_at>now();
END IF;
IF r IS NULL THEN PERFORM public.aviv_consume_rate_limit(miss,20,3600); END IF;
RETURN r; END $$;
REVOKE ALL ON FUNCTION public.aviv_read_guest_booking(text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_read_guest_booking(text,text) TO service_role;

-- Admin closures, under the shared scheduling lock so they cannot race a new hold.
CREATE FUNCTION public.aviv_admin_block_period(_start timestamptz,_end timestamptz,_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE new_id uuid; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
IF _start IS NULL OR _end IS NULL OR _end<=_start OR _end-_start>interval '366 days' THEN RAISE EXCEPTION 'Choose a valid period'; END IF;
IF _end<=now() THEN RAISE EXCEPTION 'Choose a period that ends in the future'; END IF;
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
IF EXISTS(SELECT 1 FROM public.bookings WHERE slot && tstzrange(_start,_end)) THEN RAISE EXCEPTION 'This period overlaps an existing booking or hold'; END IF;
INSERT INTO public.booking_blocks(period,reason,created_by) VALUES(tstzrange(_start,_end),left(trim(coalesce(_reason,'')),200),auth.uid()) RETURNING id INTO new_id;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),'block','booking_blocks',new_id::text,jsonb_build_object('start',_start,'end',_end));
RETURN new_id; END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_block_period(timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_block_period(timestamptz,timestamptz,text) TO authenticated,service_role;
CREATE FUNCTION public.aviv_admin_unblock_period(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
DELETE FROM public.booking_blocks WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'Period not found'; END IF;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id) VALUES(auth.uid(),'unblock','booking_blocks',_id::text); END $$;
REVOKE ALL ON FUNCTION public.aviv_admin_unblock_period(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_admin_unblock_period(uuid) TO authenticated,service_role;

-- Admin appointment actions now use the booking's duration snapshot, the AVIV schedule, blocks and slot claims.
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
    UPDATE public.bookings SET confirmed_start=_start,confirmed_end=finish,confirmed_at=now(),booking_status='confirmed',reviewed_at=coalesce(reviewed_at,now()),duration_minutes_snapshot=duration,slot=tstzrange(_start,finish),session_status='not_started',daily_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'This time overlaps another confirmed appointment'; END;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'propose' THEN
  -- The current slot stays reserved until a new time is confirmed or the booking is cancelled.
  UPDATE public.bookings SET alternative_start=_start,booking_status='reschedule_requested',confirmed_start=NULL,confirmed_end=NULL,confirmed_at=NULL,daily_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL,session_status='not_started' WHERE id=b.id;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'cancel' THEN
  IF b.booking_status NOT IN ('pending','confirmed','reschedule_requested') THEN RAISE EXCEPTION 'This booking cannot be cancelled'; END IF;
  UPDATE public.bookings SET booking_status='cancelled',cancellation_status='admin_cancelled',slot=NULL,session_status='ended',daily_room_id=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
  -- The manage link stays valid so the guest can see the cancellation; session access is revoked.
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
WHEN 'refund_review' THEN
  IF b.payment_status<>'successful' OR b.refund_status IS NOT DISTINCT FROM 'review_required' THEN RAISE EXCEPTION 'A paid booking without a pending review is required'; END IF;
  UPDATE public.bookings SET refund_status='review_required' WHERE id=b.id;
WHEN 'complete' THEN
  IF b.booking_status<>'confirmed' OR b.confirmed_end IS NULL OR b.confirmed_end>now() THEN RAISE EXCEPTION 'Only a confirmed appointment that has ended may be completed'; END IF;
  UPDATE public.bookings SET booking_status='completed',session_status='ended',slot=NULL WHERE id=b.id;
  UPDATE public.booking_access_tokens SET revoked_at=now() WHERE booking_id=b.id AND purpose='session' AND revoked_at IS NULL;
ELSE RAISE EXCEPTION 'Unsupported booking action'; END CASE;
INSERT INTO public.audit_logs(actor_id,action,resource_type,resource_id,metadata) VALUES(auth.uid(),_action,'bookings',b.id::text,jsonb_build_object('previous_status',b.booking_status,'previous_start',b.confirmed_start,'proposed_start',_start));
END $$;

-- Overview counts cover paid bookings only: unpaid holds never reach the administration queue.
CREATE OR REPLACE FUNCTION public.aviv_booking_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
RETURN (SELECT jsonb_build_object(
  'new_requests',count(*) FILTER(WHERE payment_status='successful' AND booking_status='pending' AND reviewed_at IS NULL),
  'awaiting_confirmation',count(*) FILTER(WHERE payment_status='successful' AND booking_status IN ('pending','reschedule_requested')),
  'upcoming',count(*) FILTER(WHERE booking_status='confirmed' AND confirmed_start>now()),
  'completed',count(*) FILTER(WHERE booking_status='completed'),
  -- Payments that arrive after a hold has lapsed need manual review.
  'payment_attention',count(*) FILTER(WHERE payment_status='successful' AND booking_status='expired'),
  'refund_attention',count(*) FILTER(WHERE refund_status='review_required')) FROM public.bookings); END $$;

-- Media bucket: private; published assets are readable through the existing storage policies.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('aviv-media','aviv-media',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
