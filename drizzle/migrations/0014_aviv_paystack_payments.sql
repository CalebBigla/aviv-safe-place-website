-- Paystack payments. The server starts every checkout for the booking's own price snapshot, and a
-- payment only counts after the server has verified it with Paystack. Recording is idempotent, so
-- the webhook and the return page can both report the same payment safely.

CREATE INDEX IF NOT EXISTS payment_events_reference_idx ON public.payment_events(paystack_reference);

-- Starts a checkout for the hold behind a manage link (service role only). Paying takes time, so
-- the hold is extended to 15 minutes from now, but never beyond 45 minutes after the request.
CREATE FUNCTION public.aviv_begin_payment(_manage_hash text,_reference text,_client_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; b public.bookings%ROWTYPE; miss text:='guest-miss:'||left(coalesce(_client_key,'unknown'),100); BEGIN
IF NOT public.aviv_consume_rate_limit('payment-start:'||left(coalesce(_client_key,'unknown'),100),20,3600) OR public.aviv_rate_limit_exceeded(miss,20,3600) THEN RETURN jsonb_build_object('state','rate_limited'); END IF;
IF coalesce(_reference,'') !~ '^AVIVPAY-[a-f0-9]{32}$' THEN RAISE EXCEPTION 'AVIV_INVALID_DETAILS'; END IF;
IF coalesce(_manage_hash,'') ~ '^[a-f0-9]{64}$' THEN
  SELECT t.booking_id INTO booking FROM public.booking_access_tokens t WHERE t.token_hash=_manage_hash AND t.purpose='manage' AND t.revoked_at IS NULL AND t.expires_at>now();
END IF;
IF booking IS NULL THEN PERFORM public.aviv_consume_rate_limit(miss,20,3600); RETURN jsonb_build_object('state','unavailable'); END IF;
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
SELECT * INTO b FROM public.bookings WHERE id=booking FOR UPDATE;
IF b.payment_status='successful' THEN RETURN jsonb_build_object('state','paid'); END IF;
IF b.booking_status<>'pending' OR b.slot IS NULL THEN RETURN jsonb_build_object('state','expired'); END IF;
UPDATE public.bookings SET payment_status='pending',
  request_expires_at=least(greatest(request_expires_at,now()+interval '15 minutes'),created_at+interval '45 minutes')
  WHERE id=b.id RETURNING * INTO b;
INSERT INTO public.payment_events(booking_id,paystack_reference,event_type,processing_status,idempotency_key) VALUES(b.id,_reference,'initialize','processed','initialize:'||_reference);
RETURN jsonb_build_object('state','ready','email',b.client_email,'amount_minor',b.price_minor,'currency',b.currency,'hold_expires_at',b.request_expires_at); END $$;
REVOKE ALL ON FUNCTION public.aviv_begin_payment(text,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_begin_payment(text,text,text) TO service_role;

-- Applies a payment the server has already verified with Paystack (service role only).
-- Outcomes: paid; late (paid after the hold lapsed and the time had gone, so refund review);
-- duplicate (the booking was already paid, so refund review); review (any other state);
-- mismatch (wrong amount or currency: not applied); unknown (a reference this site never issued).
CREATE FUNCTION public.aviv_record_payment(_reference text,_amount_minor bigint,_currency text,_details jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE booking uuid; b public.bookings%ROWTYPE; finish timestamptz; outcome text; previous jsonb; BEGIN
SELECT booking_id INTO booking FROM public.payment_events WHERE paystack_reference=_reference AND event_type='initialize';
IF booking IS NULL THEN RETURN jsonb_build_object('state','unknown'); END IF;
PERFORM pg_advisory_xact_lock(7312403);
PERFORM public.aviv_expire_stale_holds();
SELECT * INTO b FROM public.bookings WHERE id=booking FOR UPDATE;
-- Each payment is applied once, however many times it is reported.
SELECT verification_metadata INTO previous FROM public.payment_events WHERE paystack_reference=_reference AND event_type='charge.success';
IF previous IS NOT NULL THEN RETURN jsonb_build_object('state',coalesce(previous->>'outcome','paid'),'reference',b.public_reference); END IF;
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
INSERT INTO public.payment_events(booking_id,paystack_reference,event_type,processing_status,idempotency_key,verification_metadata)
  VALUES(b.id,_reference,'charge.success',CASE WHEN outcome='mismatch' THEN 'failed' ELSE 'processed' END,'charge.success:'||_reference,coalesce(_details,'{}'::jsonb)||jsonb_build_object('outcome',outcome));
INSERT INTO public.audit_logs(action,resource_type,resource_id,metadata) VALUES('payment_'||outcome,'bookings',b.id::text,'{}'::jsonb);
RETURN jsonb_build_object('state',outcome,'reference',b.public_reference); END $$;
REVOKE ALL ON FUNCTION public.aviv_record_payment(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.aviv_record_payment(text,bigint,text,jsonb) TO service_role;
