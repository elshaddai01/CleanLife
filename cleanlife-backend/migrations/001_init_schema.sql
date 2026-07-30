-- [DB-01] Core schema + enums per ER_DIAGRAM_CL_v6

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE subscription_tier_enum AS ENUM ('Premium', 'Gold', 'Silver');
CREATE TYPE collector_type_enum AS ENUM ('corporate', 'independent');
CREATE TYPE waste_type_enum AS ENUM ('Organic', 'Recyclable', 'Hazardous', 'Heavy Debris');
CREATE TYPE routing_status_enum AS ENUM ('searching_corporate', 'admin_hold', 'broadcast_public', 'assigned', 'completed');

CREATE TABLE companies (
    id                  SERIAL PRIMARY KEY,
    company_name        VARCHAR(100) NOT NULL,
    company_code        VARCHAR(20) NOT NULL UNIQUE,
    subscription_tier   subscription_tier_enum NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE clients (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    phone_number    VARCHAR(20) NOT NULL UNIQUE,
    company_id      INTEGER NULL REFERENCES companies(id),
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE collectors (
    id                  SERIAL PRIMARY KEY,
    username            VARCHAR(50) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    collector_type      collector_type_enum NOT NULL,
    company_id          INTEGER NULL REFERENCES companies(id),
    subscription_tier   subscription_tier_enum NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE mobility_types (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE dumpsters (
    id                      SERIAL PRIMARY KEY,
    location_coordinates    GEOMETRY(Point, 4326) NOT NULL
);

CREATE TABLE pickup_requests (
    id                      SERIAL PRIMARY KEY,
    client_id               INTEGER NOT NULL REFERENCES clients(id),
    collector_id            INTEGER NULL REFERENCES collectors(id),
    bag_count               INTEGER NOT NULL CHECK (bag_count > 0),
    waste_type              waste_type_enum NOT NULL,
    mobility_type_id        INTEGER NULL REFERENCES mobility_types(id),
    routing_status          routing_status_enum NOT NULL DEFAULT 'searching_corporate',
    admin_hold_expires_at   TIMESTAMP NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE proof_of_works (
    id                      SERIAL PRIMARY KEY,
    pickup_request_id       INTEGER NOT NULL REFERENCES pickup_requests(id),
    photo_storage_url       VARCHAR(255) NOT NULL,
    exif_latitude           DECIMAL(9,6) NULL,
    exif_longitude          DECIMAL(9,6) NULL,
    is_verified             BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_dumpsters_geom ON dumpsters USING GIST (location_coordinates);
CREATE INDEX idx_clients_company_id ON clients(company_id);
CREATE INDEX idx_collectors_company_id ON collectors(company_id);
CREATE INDEX idx_pickup_requests_client_id ON pickup_requests(client_id);
CREATE INDEX idx_pickup_requests_routing_status ON pickup_requests(routing_status);

INSERT INTO mobility_types (name) VALUES ('Wheelbarrow'), ('Tricycle'), ('Van');
