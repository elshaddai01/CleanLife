-- [WALLET-06] Avoiding a repeat of the migration-012 class of bug: a plain
-- follow-up query for estimated_price_fcfa would run with no tenant context,
-- default to 'public', and RLS would silently return zero rows for any
-- request whose client belongs to a company — no error, wallet credit just
-- silently never happens. Returning the price directly from the same
-- SECURITY DEFINER call instead of a second query sidesteps it entirely.

DROP FUNCTION IF EXISTS complete_pickup_request(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION complete_pickup_request(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, routing_status routing_status_enum, payment_status payment_status_enum, estimated_price_fcfa DECIMAL)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET routing_status = 'completed', payment_status = 'COMPLETED'
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id = p_collector_id
      AND pickup_requests.routing_status = 'assigned'
    RETURNING pickup_requests.id, pickup_requests.routing_status, pickup_requests.payment_status, pickup_requests.estimated_price_fcfa;
$$;

GRANT EXECUTE ON FUNCTION complete_pickup_request(INTEGER, INTEGER) TO app_user;
