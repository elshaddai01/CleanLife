-- [DISP-08] Same chicken-and-egg as login and find_client_by_id: the admin
-- manual-assign endpoint only knows a pickup_request id, not which tenant it
-- belongs to, and a plain query defaults to 'public' context — which can
-- never see a 'searching_corporate' row scoped to a specific company. Narrow
-- SECURITY DEFINER lookup, same reasoning as migrations 003 and 006.

CREATE OR REPLACE FUNCTION find_pickup_request_company(p_request_id INTEGER)
RETURNS TABLE (request_id INTEGER, company_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT pr.id, c.company_id
    FROM pickup_requests pr
    JOIN clients c ON c.id = pr.client_id
    WHERE pr.id = p_request_id;
$$;

REVOKE ALL ON FUNCTION find_pickup_request_company(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_pickup_request_company(INTEGER) TO app_user;
