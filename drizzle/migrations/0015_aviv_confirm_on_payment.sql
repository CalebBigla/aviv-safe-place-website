-- A verified payment now confirms the appointment straight away, for the time the client held, so
-- clients get their confirmation and video link without waiting for an administrator. The time was
-- already validated against the schedule and claimed through bookings.slot when the hold was made,
-- so confirming it cannot overlap another appointment. Late, duplicate and mismatched payments are
-- handled exactly as before and never confirm anything.

CREATE OR REPLACE FUNCTION public.aviv_record_payment(_reference text,_amount_minor bigint,_currency text,_details jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; b public.bookings%ROWTYPE; finish timestamptz; outcome text; previous jsonb; confirmed boolean:=false; BEGIN
SELECT booking_id INTO booking FROM public.payment_events WHERE paystack_reference=_reference AND event_type='initialize';
IF booking IS NULL THEN RETURN jsonb_build_object('state','unknown'); END IF;
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
SELECT * INTO b FROM public.bookings WHERE id=booking FOR UPDATE;
-- Each payment is applied once, however many times it is reported. Only the first report is
-- marked 'first', so the confirmation email is sent once even when the webhook and the return
-- page both report the same payment.
SELECT verification_metadata INTO previous FROM public.payment_events WHERE paystack_reference=_reference AND event_type='charge.success';
IF previous IS NOT NULL THEN RETURN jsonb_build_object('state',coalesce(previous->>'outcome','paid'),'reference',b.public_reference,'first',false,'confirmed',coalesce((previous->>'confirmed')::boolean,false)); END IF;
IF _amount_minor IS DISTINCT FROM b.price_minor OR _currency IS DISTINCT FROM b.currency THEN
  outcome:='mismatch';
ELSIF b.payment_status='successful' THEN
  outcome:='duplicate';
  UPDATE public.bookings SET refund_status='review_required' WHERE id=b.id;
ELSIF b.booking_status='pending' AND b.slot IS NOT NULL THEN
  outcome:='paid';
  UPDATE public.bookings SET payment_status='successful',payment_reference=_reference WHERE id=b.id;
ELSIF b.booking_status='expired' THEN
  -- Paid after the hold lapsed: keep the time if it is still free, otherwise flag a refund review.
  finish:=b.requested_start+make_interval(mins=>coalesce(b.duration_minutes_snapshot,0));
  IF b.requested_start>now() AND b.duration_minutes_snapshot IN (30,60)
     AND NOT EXISTS(SELECT 1 FROM public.booking_blocks WHERE period && tstzrange(b.requested_start,finish))
     AND NOT EXISTS(SELECT 1 FROM public.bookings WHERE id<>b.id AND slot && tstzrange(b.requested_start,finish)) THEN
    outcome:='paid';
    UPDATE public.bookings SET booking_status='pending',payment_status='successful',payment_reference=_reference,slot=tstzrange(b.requested_start,finish) WHERE id=b.id;
  ELSE
    outcome:='late';
    UPDATE public.bookings SET payment_status='successful',payment_reference=_reference,refund_status='review_required' WHERE id=b.id;
  END IF;
ELSE
  outcome:='review';
  UPDATE public.bookings SET payment_status='successful',payment_reference=coalesce(payment_reference,_reference),refund_status='review_required' WHERE id=b.id;
END IF;
-- Confirm the held time, as an administrator's confirmation would. A time that has already
-- started is left for an administrator to handle.
IF outcome='paid' THEN
  SELECT * INTO b FROM public.bookings WHERE id=b.id;
  IF b.booking_status='pending' AND b.slot IS NOT NULL AND lower(b.slot)>now() THEN
    UPDATE public.bookings SET confirmed_start=lower(b.slot),confirmed_end=upper(b.slot),confirmed_at=now(),booking_status='confirmed',session_status='not_started',meeting_room_id=NULL,meeting_provider=NULL,meeting_link_issued_at=NULL WHERE id=b.id;
    INSERT INTO public.audit_logs(action,resource_type,resource_id,metadata) VALUES('confirm','bookings',b.id::text,jsonb_build_object('previous_status','pending','automatic',true,'proposed_start',lower(b.slot)));
    confirmed:=true;
  END IF;
END IF;
INSERT INTO public.payment_events(booking_id,paystack_reference,event_type,processing_status,idempotency_key,verification_metadata)
  VALUES(b.id,_reference,'charge.success',CASE WHEN outcome='mismatch' THEN 'failed' ELSE 'processed' END,'charge.success:'||_reference,coalesce(_details,'{}'::jsonb)||jsonb_build_object('outcome',outcome,'confirmed',confirmed));
INSERT INTO public.audit_logs(action,resource_type,resource_id,metadata) VALUES('payment_'||outcome,'bookings',b.id::text,'{}'::jsonb);
RETURN jsonb_build_object('state',outcome,'reference',b.public_reference,'first',true,'confirmed',confirmed); END $$;
REVOKE ALL ON FUNCTION public.aviv_record_payment(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_record_payment(text,bigint,text,jsonb) TO service_role;

-- Issues the session link for the confirmation email of a payment-confirmed appointment (service
-- role only). Returns null when the appointment isn't confirmed or has ended.
CREATE FUNCTION public.aviv_payment_confirmation_link(_reference text,_session_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; closes timestamptz; BEGIN
IF coalesce(_session_hash,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid session link'; END IF;
SELECT * INTO b FROM public.bookings WHERE payment_reference=_reference FOR UPDATE;
IF NOT FOUND OR b.booking_status<>'confirmed' OR b.payment_status<>'successful' OR b.confirmed_start IS NULL OR b.confirmed_end IS NULL THEN RETURN NULL; END IF;
closes:=b.confirmed_end+interval '15 minutes';
IF closes<=now() THEN RETURN NULL; END IF;
INSERT INTO public.booking_access_tokens(booking_id,token_hash,purpose,expires_at) VALUES(b.id,_session_hash,'session',closes);
RETURN jsonb_build_object('id',b.id,'name',b.client_name,'email',b.client_email,'start',b.confirmed_start,'end',b.confirmed_end,'reference',b.public_reference); END $$;
REVOKE ALL ON FUNCTION public.aviv_payment_confirmation_link(text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_payment_confirmation_link(text,text) TO service_role;

-- Records whether that email went out. State only: never the address, link or content.
CREATE FUNCTION public.aviv_record_payment_confirmation_email(_reference text,_sent boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
INSERT INTO public.audit_logs(action,resource_type,resource_id)
  SELECT CASE WHEN _sent THEN 'confirmation_email_sent' ELSE 'confirmation_email_failed' END,'bookings',id::text FROM public.bookings WHERE payment_reference=_reference; END $$;
REVOKE ALL ON FUNCTION public.aviv_record_payment_confirmation_email(text,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_record_payment_confirmation_email(text,boolean) TO service_role;
