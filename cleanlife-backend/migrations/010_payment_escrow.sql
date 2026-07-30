-- [PAY-01] Financial Escrow (SRS 3.4): funds held PENDING_COMPLETION until
-- physical disposal is verified, then released (COMPLETED). Cash and MoMo
-- follow different collection mechanics but the SAME escrow release rule.

CREATE TYPE payment_method_enum AS ENUM ('CASH', 'MOMO');
CREATE TYPE payment_status_enum AS ENUM ('PENDING_COMPLETION', 'COMPLETED', 'FAILED');

ALTER TABLE pickup_requests
    ADD COLUMN payment_method payment_method_enum NULL,
    ADD COLUMN payment_status payment_status_enum NOT NULL DEFAULT 'PENDING_COMPLETION',
    ADD COLUMN collector_arrived_at TIMESTAMP NULL,
    ADD COLUMN cash_collected_at TIMESTAMP NULL,
    ADD COLUMN momo_requested_at TIMESTAMP NULL,
    ADD COLUMN momo_confirmed_at TIMESTAMP NULL;

-- [PAY-02] Collector-side actions on an ALREADY-ASSIGNED request need a
-- different authority check than the tenant-ownership one used for
-- creation/claiming: the right question here is "am I the assigned
-- collector", not "do I share a tenant with the client". An independent
-- collector who claimed an escalated corporate request is a legitimate
-- case where those two checks diverge (same reasoning as migration 007's
-- claim function) — so these go through SECURITY DEFINER functions too.

CREATE OR REPLACE FUNCTION mark_collector_arrived(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, payment_method payment_method_enum, collector_arrived_at TIMESTAMP)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET collector_arrived_at = now()
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id = p_collector_id
      AND pickup_requests.routing_status = 'assigned'
    RETURNING pickup_requests.id, pickup_requests.payment_method, pickup_requests.collector_arrived_at;
$$;

-- [PAY-03] Cash: collector confirms receipt on-site. This does NOT release
-- escrow by itself — per SRS 3.4, release only happens at verified disposal
-- (see complete_pickup_request in migration 011). This just records the
-- factual on-site handoff and is where a real system would fire the
-- commission-processing webhook mentioned in the SRS.
CREATE OR REPLACE FUNCTION confirm_cash_collected(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, cash_collected_at TIMESTAMP)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET cash_collected_at = now()
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id = p_collector_id
      AND pickup_requests.payment_method = 'CASH'
    RETURNING pickup_requests.id, pickup_requests.cash_collected_at;
$$;

-- [PAY-04] MoMo confirmation — called by the (simulated) provider webhook,
-- not the collector, so no collector_id check here; scoped by request id
-- and payment_method only. Does NOT release escrow either — same rule.
CREATE OR REPLACE FUNCTION confirm_momo_payment(p_request_id INTEGER)
RETURNS TABLE (id INTEGER, momo_confirmed_at TIMESTAMP)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET momo_confirmed_at = now()
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.payment_method = 'MOMO'
    RETURNING pickup_requests.id, pickup_requests.momo_confirmed_at;
$$;

REVOKE ALL ON FUNCTION mark_collector_arrived(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_cash_collected(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_momo_payment(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_collector_arrived(INTEGER, INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION confirm_cash_collected(INTEGER, INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION confirm_momo_payment(INTEGER) TO app_user;
