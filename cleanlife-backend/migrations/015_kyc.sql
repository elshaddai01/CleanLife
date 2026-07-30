-- [KYC-01] ASSUMPTION FLAGGED: modeled as collector-only, since the
-- prototype's example data only shows KYC used for gig-worker identity
-- verification, not client-side. Revisit if clients need it too.

CREATE TYPE kyc_status_enum AS ENUM ('unverified', 'pending', 'verified', 'rejected');

ALTER TABLE collectors
    ADD COLUMN kyc_status kyc_status_enum NOT NULL DEFAULT 'unverified',
    ADD COLUMN kyc_document_url TEXT NULL,
    ADD COLUMN kyc_document_name VARCHAR(255) NULL,
    ADD COLUMN kyc_submitted_at TIMESTAMP NULL;

-- Admin review can cross tenants (one admin key reviews any company's
-- collectors) — same SECURITY DEFINER reasoning as every other admin action.
CREATE OR REPLACE FUNCTION review_kyc(p_collector_id INTEGER, p_new_status TEXT)
RETURNS TABLE (id INTEGER, kyc_status kyc_status_enum)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_new_status NOT IN ('verified', 'rejected') THEN
        RAISE EXCEPTION 'kyc review status must be verified or rejected';
    END IF;

    RETURN QUERY
    UPDATE collectors
    SET kyc_status = p_new_status::kyc_status_enum
    WHERE collectors.id = p_collector_id AND collectors.kyc_status = 'pending'
    RETURNING collectors.id, collectors.kyc_status;
END;
$$;

REVOKE ALL ON FUNCTION review_kyc(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION review_kyc(INTEGER, TEXT) TO app_user;
