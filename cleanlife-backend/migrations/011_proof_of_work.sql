-- [POW-01] Physical dumpster bins get a painted alphanumeric code as a
-- low-tech fallback when GPS/EXIF precision fails (cloud cover, dense
-- structures). Unique so a code always maps to exactly one bin.
ALTER TABLE dumpsters ADD COLUMN bin_code VARCHAR(50) UNIQUE NULL;

CREATE TYPE verification_method_enum AS ENUM ('gps', 'bin_code');

ALTER TABLE proof_of_works
    ADD COLUMN verification_method verification_method_enum NULL,
    ADD COLUMN dumpster_id INTEGER NULL REFERENCES dumpsters(id);

-- [POW-02] Insert the proof-of-work record. GPS-vs-bin-code matching and
-- the 100m distance check happens in the app layer (dumpsters have no RLS,
-- so that's a plain read); this function does the actual write, scoped by
-- "am I the assigned collector" — same reasoning as migration 010's
-- payment functions.
CREATE OR REPLACE FUNCTION insert_proof_of_work(
    p_request_id INTEGER,
    p_collector_id INTEGER,
    p_photo_url VARCHAR,
    p_exif_lat DECIMAL,
    p_exif_lng DECIMAL,
    p_verification_method verification_method_enum,
    p_dumpster_id INTEGER,
    p_is_verified BOOLEAN
)
RETURNS TABLE (id INTEGER, is_verified BOOLEAN, verification_method verification_method_enum, dumpster_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO proof_of_works
        (pickup_request_id, photo_storage_url, exif_latitude, exif_longitude,
         verification_method, dumpster_id, is_verified)
    SELECT p_request_id, p_photo_url, p_exif_lat, p_exif_lng,
           p_verification_method, p_dumpster_id, p_is_verified
    WHERE EXISTS (
        SELECT 1 FROM pickup_requests
        WHERE pickup_requests.id = p_request_id
          AND pickup_requests.collector_id = p_collector_id
          AND pickup_requests.routing_status = 'assigned'
    )
    RETURNING proof_of_works.id, proof_of_works.is_verified,
              proof_of_works.verification_method, proof_of_works.dumpster_id;
$$;

-- [POW-03 / PAY-05] Verified disposal is the ONLY trigger that completes a
-- request and releases escrow (SRS 3.4) — regardless of payment method.
CREATE OR REPLACE FUNCTION complete_pickup_request(p_request_id INTEGER, p_collector_id INTEGER)
RETURNS TABLE (id INTEGER, routing_status routing_status_enum, payment_status payment_status_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE pickup_requests
    SET routing_status = 'completed', payment_status = 'COMPLETED'
    WHERE pickup_requests.id = p_request_id
      AND pickup_requests.collector_id = p_collector_id
      AND pickup_requests.routing_status = 'assigned'
    RETURNING pickup_requests.id, pickup_requests.routing_status, pickup_requests.payment_status;
$$;

REVOKE ALL ON FUNCTION insert_proof_of_work(INTEGER, INTEGER, VARCHAR, DECIMAL, DECIMAL, verification_method_enum, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_pickup_request(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION insert_proof_of_work(INTEGER, INTEGER, VARCHAR, DECIMAL, DECIMAL, verification_method_enum, INTEGER, BOOLEAN) TO app_user;
GRANT EXECUTE ON FUNCTION complete_pickup_request(INTEGER, INTEGER) TO app_user;
