-- [DISP-07] Real bug found while testing the dispatch engine, affecting
-- every RLS-protected table, not just pickup_requests:
--
-- current_tenant() used COALESCE(current_setting(...), 'public') on the
-- assumption that an unset session var reads back as NULL. That's true only
-- the FIRST time a custom GUC is referenced in a session. Once ANY
-- transaction does `SET LOCAL app.current_company_id = 'X'` (which
-- withTenant() does for every scoped write), Postgres reverts the setting
-- at COMMIT/ROLLBACK to its "prior value" — but for a custom GUC that was
-- never truly initialized, that prior value is an EMPTY STRING, not NULL.
--
-- Net effect: any plain pool.query() (not wrapped in withTenant) that
-- happens to reuse a pooled connection which had EVER been used for a
-- tenant-scoped write would see current_setting(...) = '' instead of NULL.
-- COALESCE doesn't catch that (COALESCE only replaces NULL), so
-- current_tenant() returned '' instead of falling back to 'public', and
-- every policy's `ELSE company_id = current_tenant()::integer` branch tried
-- to cast '' to integer and threw "invalid input syntax for type integer".
--
-- Fix: treat empty string the same as NULL.

CREATE OR REPLACE FUNCTION current_tenant() RETURNS TEXT AS $$
    SELECT COALESCE(NULLIF(current_setting('app.current_company_id', true), ''), 'public');
$$ LANGUAGE sql STABLE;
