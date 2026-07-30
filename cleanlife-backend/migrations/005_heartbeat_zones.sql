-- [OFF-01] Heartbeat & Zones: collectors check into a static sector rather
-- than streaming continuous GPS. Adds current zone + last check-in time.

ALTER TABLE collectors
    ADD COLUMN current_area_id VARCHAR(100) NULL,
    ADD COLUMN last_heartbeat_at TIMESTAMP NULL;

CREATE INDEX idx_collectors_current_area_id ON collectors(current_area_id);
