-- [DB-02] Row-Level Security: tenant isolation via app.current_company_id session var.
-- NULL company_id rows (independent) = visible in public/marketplace context only.
-- App backend must run: SET LOCAL app.current_company_id = '<id>';  (or 'public' for marketplace queries)

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE collectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_requests ENABLE ROW LEVEL SECURITY;

-- Helper: current tenant context, defaults to 'public' (marketplace) if unset.
CREATE OR REPLACE FUNCTION current_tenant() RETURNS TEXT AS $$
    SELECT COALESCE(current_setting('app.current_company_id', true), 'public');
$$ LANGUAGE sql STABLE;

-- CLIENTS
CREATE POLICY tenant_isolation_clients ON clients
    USING (
        (current_tenant() = 'public' AND company_id IS NULL)
        OR (current_tenant() <> 'public' AND company_id = current_tenant()::integer)
    );

-- COLLECTORS
CREATE POLICY tenant_isolation_collectors ON collectors
    USING (
        (current_tenant() = 'public' AND company_id IS NULL)
        OR (current_tenant() <> 'public' AND company_id = current_tenant()::integer)
    );

-- PICKUP_REQUESTS: scoped via the owning client's company_id
CREATE POLICY tenant_isolation_pickup_requests ON pickup_requests
    USING (
        client_id IN (
            SELECT id FROM clients
            WHERE (current_tenant() = 'public' AND company_id IS NULL)
               OR (current_tenant() <> 'public' AND company_id = current_tenant()::integer)
        )
    );

-- Backend connects as app_user (NOT superuser/table owner) so RLS actually applies.
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user LOGIN PASSWORD 'app_user_pw';
    END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON clients, collectors, pickup_requests TO app_user;
GRANT SELECT, INSERT, UPDATE ON companies, mobility_types, dumpsters, proof_of_works TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
