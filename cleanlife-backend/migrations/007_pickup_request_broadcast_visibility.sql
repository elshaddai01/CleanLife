-- [DISP-06] Hardening gap found while building the dispatch engine:
-- migration 002's pickup_requests policy scoped ALL rows to the owning
-- client's company, with no exception. But the SRS's escalation path
-- ("broadcast to all available collectors" after the 2-min admin hold, and
-- the Premium->Gold->Silver cascade) requires a request that started under
-- one company's client to become visible to the entire independent
-- marketplace once routing_status = 'broadcast_public'. The old policy made
-- that structurally impossible — an independent collector could never see
-- or claim an escalated corporate request.
--
-- Fix: SELECT is open for broadcast_public rows regardless of owning
-- tenant. INSERT stays strictly ownership-checked (you can never fabricate
-- a fresh row against a client you don't own). The actual claim and
-- escalation actions are moved into narrow SECURITY DEFINER functions
-- rather than relying on raw UPDATE through RLS — this avoids a subtler
-- problem: Postgres RLS's WITH CHECK on UPDATE only sees the NEW row, so
-- there's no clean declarative way to say "this row WAS public, so claiming
-- it is fine even though the new status no longer says broadcast_public."
-- A SECURITY DEFINER function sidesteps that entirely and keeps the
-- business rule (atomic, unclaimed, correct prior state) enforced in one
-- place instead of split between the app and a fragile policy expression.

DROP POLICY IF EXISTS tenant_isolation_pickup_requests ON pickup_requests;

CREATE POLICY pickup_requests_select ON pickup_requests
    FOR SELECT
    USING (
        routing_status = 'broadcast_public'
        OR client_id IN (
            SELECT id FROM clients
            WHERE CASE WHEN current_tenant() = 'public'
                THEN company_id IS NULL
                ELSE company_id = current_tenant()::integer
            END
        )
    );

CREATE POLICY pickup_requests_insert ON pickup_requests
    FOR INSERT
    WITH CHECK (
        client_id IN (
            SELECT id FROM clients
            WHERE CASE WHEN current_tenant() = 'public'
                THEN company_id IS NULL
                ELSE company_id = current_tenant()::integer
            END
        )
    );

CREATE POLICY pickup_requests_update ON pickup_requests
    FOR UPDATE
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE CASE WHEN current_tenant() = 'public'
                THEN company_id IS NULL
                ELSE company_id = current_tenant()::integer
            END
        )
    )
    WITH CHECK (
        client_id IN (
            SELECT id FROM clients
            WHERE CASE WHEN current_tenant() = 'public'
                THEN company_id IS NULL
                ELSE company_id = current_tenant()::integer
            END
        )
    );
-- (Ordinary tenant-scoped updates — e.g. an admin editing their own
-- company's request — still work via this policy. Claiming and escalation
-- go through the functions below instead.)

CREATE OR REPLACE FUNCTION claim_pickup_request(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, routing_status routing_status_enum, collector_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET routing_status = 'assigned', collector_id = p_collector_id
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id IS NULL
      AND pickup_requests.routing_status = 'broadcast_public'
    RETURNING pickup_requests.id, pickup_requests.routing_status, pickup_requests.collector_id;
$$;

CREATE OR REPLACE FUNCTION escalate_admin_hold(p_request_id INTEGER)
RETURNS TABLE (id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET routing_status = 'broadcast_public', current_stage_rank = 1
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.routing_status = 'searching_corporate'
      AND pickup_requests.collector_id IS NULL
    RETURNING pickup_requests.id;
$$;

CREATE OR REPLACE FUNCTION escalate_stage(p_request_id INTEGER, p_target_rank SMALLINT)
RETURNS TABLE (id INTEGER, current_stage_rank SMALLINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET current_stage_rank = p_target_rank
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.routing_status = 'broadcast_public'
      AND pickup_requests.collector_id IS NULL
      AND pickup_requests.current_stage_rank < p_target_rank
    RETURNING pickup_requests.id, pickup_requests.current_stage_rank;
$$;

REVOKE ALL ON FUNCTION claim_pickup_request(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION escalate_admin_hold(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION escalate_stage(INTEGER, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_pickup_request(INTEGER, INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION escalate_admin_hold(INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION escalate_stage(INTEGER, SMALLINT) TO app_user;
