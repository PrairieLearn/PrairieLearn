ALTER TABLE institutions
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN IF NOT EXISTS default_authn_provider_id BIGINT REFERENCES authn_providers ON DELETE SET NULL ON UPDATE CASCADE;
