-- [DISP-01] Dispatch engine support:
-- - client_latitude/longitude: captured once at request time (not stored
--   persistently on the client — a one-shot GPS read from the app, consistent
--   with the no-continuous-tracking constraint), used for mobility evaluation
--   and nearest-dumpster distance.
-- - current_stage_rank: cascading broadcast wave. 1 = Premium-only visibility,
--   2 = Premium+Gold, 3 = all tiers (Premium+Gold+Silver). Starts at 1 for
--   independent/public requests and escalates over time if unclaimed.

ALTER TABLE pickup_requests
    ADD COLUMN client_latitude DECIMAL(9,6) NULL,
    ADD COLUMN client_longitude DECIMAL(9,6) NULL,
    ADD COLUMN current_stage_rank SMALLINT NOT NULL DEFAULT 1;

CREATE INDEX idx_pickup_requests_stage_rank ON pickup_requests(current_stage_rank);

-- [DISP-02] Request creation only knows client_id, not which tenant the
-- client belongs to (no client auth/session exists yet — flagged as a gap
-- to close in a future sprint). Same pattern as the collector login lookup:
-- a narrow SECURITY DEFINER function instead of bypassing RLS broadly.
CREATE OR REPLACE FUNCTION find_client_by_id(p_client_id INTEGER)
RETURNS TABLE (id INTEGER, name VARCHAR(100), company_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, name, company_id FROM clients WHERE id = p_client_id;
$$;

REVOKE ALL ON FUNCTION find_client_by_id(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_client_by_id(INTEGER) TO app_user;
