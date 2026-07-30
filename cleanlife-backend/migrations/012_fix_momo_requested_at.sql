-- [PAY-06] Bug found in testing: the /arrive route did mark_collector_arrived()
-- (a SECURITY DEFINER function, bypasses RLS correctly) followed by a
-- SEPARATE plain `UPDATE pickup_requests SET momo_requested_at = now()`.
-- That second query had no tenant context, defaulted to 'public', and the
-- UPDATE policy's ownership check silently matched zero rows for any
-- request whose client belongs to a company — no error, just a quiet no-op.
-- momo_requested_at never got set. Folding it into the same SECURITY
-- DEFINER function fixes it atomically and avoids the same trap recurring.

DROP FUNCTION IF EXISTS mark_collector_arrived(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION mark_collector_arrived(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, payment_method payment_method_enum, collector_arrived_at TIMESTAMP, momo_requested_at TIMESTAMP)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET collector_arrived_at = now(),
        momo_requested_at = CASE WHEN pickup_requests.payment_method = 'MOMO' THEN now() ELSE momo_requested_at END
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id = p_collector_id
      AND pickup_requests.routing_status = 'assigned'
    RETURNING pickup_requests.id, pickup_requests.payment_method,
              pickup_requests.collector_arrived_at, pickup_requests.momo_requested_at;
$$;

GRANT EXECUTE ON FUNCTION mark_collector_arrived(INTEGER, INTEGER) TO app_user;
