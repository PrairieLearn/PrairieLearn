ALTER TABLE errors
ADD COLUMN variant_id bigint REFERENCES variants ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX errors_variant_id_idx ON errors (variant_id);
