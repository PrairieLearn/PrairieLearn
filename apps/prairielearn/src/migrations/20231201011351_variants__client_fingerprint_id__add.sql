ALTER TABLE variants
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;
