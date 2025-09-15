ALTER TABLE variants
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN client_fingerprint_id BIGINT REFERENCES client_fingerprints (id) ON UPDATE CASCADE ON DELETE SET NULL;
