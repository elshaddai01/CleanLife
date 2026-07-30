-- [CLIENT-AUTH-01] Clients have never had real login — pickup-request
-- creation still accepts a bare client_id (flagged as a gap since ONBOARD).
-- Closing it now: password auth mirroring collectors, phone_number as the
-- login identifier (already unique).

ALTER TABLE clients ADD COLUMN password_hash VARCHAR(255) NULL;

-- Same chicken-and-egg as collector login: need to find a client by phone
-- before knowing their tenant. Narrow SECURITY DEFINER lookup, same pattern
-- as migration 003.
CREATE OR REPLACE FUNCTION find_client_by_phone(p_phone VARCHAR)
RETURNS TABLE (id INTEGER, name VARCHAR(100), phone_number VARCHAR(20), password_hash VARCHAR(255), company_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, name, phone_number, password_hash, company_id FROM clients WHERE phone_number = p_phone;
$$;

REVOKE ALL ON FUNCTION find_client_by_phone(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_client_by_phone(VARCHAR) TO app_user;
