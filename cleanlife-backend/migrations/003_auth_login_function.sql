-- [AUTH-01] Login needs to find a collector by username regardless of tenant,
-- before we know which tenant they belong to. Rather than granting app_user
-- BYPASSRLS (which would blow a hole through all tenant isolation), we expose
-- exactly one narrow, read-only lookup via a SECURITY DEFINER function owned
-- by the table owner (postgres), which bypasses RLS only inside this function.

CREATE OR REPLACE FUNCTION find_collector_by_username(p_username TEXT)
RETURNS TABLE (
    id INTEGER,
    username VARCHAR(50),
    password_hash VARCHAR(255),
    collector_type collector_type_enum,
    company_id INTEGER,
    subscription_tier subscription_tier_enum
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, username, password_hash, collector_type, company_id, subscription_tier
    FROM collectors
    WHERE username = p_username;
$$;

REVOKE ALL ON FUNCTION find_collector_by_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_collector_by_username(TEXT) TO app_user;
