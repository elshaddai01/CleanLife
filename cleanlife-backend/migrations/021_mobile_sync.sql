-- Authenticated mobile synchronization queries used to restore state after restart.

DROP FUNCTION IF EXISTS get_pickup_request_status_for_actor(INTEGER, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION get_pickup_request_status_for_actor(p_request_id INTEGER, p_actor_role TEXT, p_actor_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    routing_status routing_status_enum,
    collector_id INTEGER,
    payment_method payment_method_enum,
    payment_status payment_status_enum,
    collector_arrived_at TIMESTAMP,
    cash_collected_at TIMESTAMP,
    momo_confirmed_at TIMESTAMP,
    has_proof_of_work BOOLEAN
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT pr.id, pr.routing_status, pr.collector_id, pr.payment_method, pr.payment_status,
           pr.collector_arrived_at, pr.cash_collected_at, pr.momo_confirmed_at,
           EXISTS (SELECT 1 FROM proof_of_works pow WHERE pow.pickup_request_id = pr.id)
    FROM pickup_requests pr
    WHERE pr.id = p_request_id
      AND ((p_actor_role = 'client' AND pr.client_id = p_actor_id)
        OR (p_actor_role = 'collector' AND pr.collector_id = p_actor_id));
$$;

CREATE OR REPLACE FUNCTION list_client_pickup_requests(p_client_id INTEGER)
RETURNS SETOF pickup_requests
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT * FROM pickup_requests WHERE client_id = p_client_id ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION list_collector_active_requests(p_collector_id INTEGER)
RETURNS SETOF pickup_requests
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT * FROM pickup_requests
    WHERE collector_id = p_collector_id AND routing_status = 'assigned'
    ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION get_collector_profile(p_collector_id INTEGER)
RETURNS TABLE (
    id INTEGER, username VARCHAR(50), collector_type collector_type_enum,
    subscription_tier subscription_tier_enum, kyc_status kyc_status_enum,
    kyc_document_name VARCHAR(255), kyc_submitted_at TIMESTAMP
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT c.id, c.username, c.collector_type, c.subscription_tier, c.kyc_status,
           c.kyc_document_name, c.kyc_submitted_at
    FROM collectors c WHERE c.id = p_collector_id;
$$;

REVOKE ALL ON FUNCTION get_pickup_request_status_for_actor(INTEGER, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_client_pickup_requests(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_collector_active_requests(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_collector_profile(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pickup_request_status_for_actor(INTEGER, TEXT, INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION list_client_pickup_requests(INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION list_collector_active_requests(INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION get_collector_profile(INTEGER) TO app_user;
