-- [TRACK-01] Real gap found building the mobile client's tracking screen:
-- there was no way to check a single pickup request's current status after
-- creation — only creation, listing available jobs (collector-only), and
-- action endpoints existed. This is a read-only status lookup, keyed by a
-- request id the client already has from their own creation response (same
-- reasoning as the other SECURITY DEFINER lookups: narrow, read-only,
-- doesn't expose cross-tenant listing).
CREATE OR REPLACE FUNCTION get_pickup_request_status(p_request_id INTEGER)
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
        EXISTS (SELECT 1 FROM proof_of_works pow WHERE pow.pickup_request_id = pr.id) AS has_proof_of_work
    FROM pickup_requests pr
    WHERE pr.id = p_request_id;
$$;

REVOKE ALL ON FUNCTION get_pickup_request_status(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pickup_request_status(INTEGER) TO app_user;
