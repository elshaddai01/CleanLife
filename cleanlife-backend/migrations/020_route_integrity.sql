-- Route and authorization integrity fixes discovered during the backend audit.

DROP FUNCTION IF EXISTS claim_pickup_request(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION claim_pickup_request(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, routing_status routing_status_enum, collector_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests AS pr
    SET routing_status = 'assigned', collector_id = p_collector_id
    FROM collectors AS c
    WHERE pr.id = p_request_id
      AND pr.collector_id IS NULL
      AND pr.routing_status = 'broadcast_public'
      AND c.id = p_collector_id
      AND c.collector_type = 'independent'
      AND CASE c.subscription_tier
            WHEN 'Premium' THEN 1
            WHEN 'Gold' THEN 2
            ELSE 3
          END <= pr.current_stage_rank
    RETURNING pr.id, pr.routing_status, pr.collector_id;
$$;

DROP FUNCTION IF EXISTS get_pickup_request_status(INTEGER);
CREATE OR REPLACE FUNCTION get_pickup_request_status_for_actor(
    p_request_id INTEGER,
    p_actor_role TEXT,
    p_actor_id INTEGER
)
RETURNS TABLE (
    id INTEGER,
    routing_status routing_status_enum,
    collector_id INTEGER,
    payment_status payment_status_enum,
    collector_arrived_at TIMESTAMP,
    cash_collected_at TIMESTAMP,
    momo_confirmed_at TIMESTAMP,
    has_proof_of_work BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        pr.id,
        pr.routing_status,
        pr.collector_id,
        pr.payment_status,
        pr.collector_arrived_at,
        pr.cash_collected_at,
        pr.momo_confirmed_at,
        EXISTS (SELECT 1 FROM proof_of_works pow WHERE pow.pickup_request_id = pr.id)
    FROM pickup_requests pr
    WHERE pr.id = p_request_id
      AND ((p_actor_role = 'client' AND pr.client_id = p_actor_id)
        OR (p_actor_role = 'collector' AND pr.collector_id = p_actor_id));
$$;

CREATE INDEX IF NOT EXISTS idx_pickup_requests_dispatch
    ON pickup_requests(routing_status, admin_hold_expires_at, current_stage_rank)
    WHERE collector_id IS NULL;

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
      AND pickup_requests.routing_status = 'assigned'
      AND pickup_requests.payment_method = 'CASH'
      AND pickup_requests.collector_arrived_at IS NOT NULL
      AND pickup_requests.cash_collected_at IS NULL
    RETURNING pickup_requests.id, pickup_requests.cash_collected_at;
$$;

CREATE OR REPLACE FUNCTION confirm_momo_payment(p_request_id INTEGER)
RETURNS TABLE (id INTEGER, momo_confirmed_at TIMESTAMP)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET momo_confirmed_at = now()
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.routing_status = 'assigned'
      AND pickup_requests.payment_method = 'MOMO'
      AND pickup_requests.collector_arrived_at IS NOT NULL
      AND pickup_requests.momo_confirmed_at IS NULL
    RETURNING pickup_requests.id, pickup_requests.momo_confirmed_at;
$$;

REVOKE ALL ON FUNCTION claim_pickup_request(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_pickup_request_status_for_actor(INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_pickup_request(INTEGER, INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION get_pickup_request_status_for_actor(INTEGER, TEXT, INTEGER) TO app_user;
