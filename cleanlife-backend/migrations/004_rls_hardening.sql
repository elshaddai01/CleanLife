-- [DB-03] Hardening gap found: proof_of_works had RLS disabled entirely.
-- A pickup_request is tenant-scoped via its client's company_id, but the
-- proof-of-work photo/EXIF records tied to that request were fully open to
-- any tenant context. Closing that here.

ALTER TABLE proof_of_works ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_proof_of_works ON proof_of_works
    USING (
        pickup_request_id IN (
            SELECT pr.id
            FROM pickup_requests pr
            JOIN clients c ON c.id = pr.client_id
            WHERE CASE WHEN current_tenant() = 'public'
                THEN c.company_id IS NULL
                ELSE c.company_id = current_tenant()::integer
            END
        )
    );
