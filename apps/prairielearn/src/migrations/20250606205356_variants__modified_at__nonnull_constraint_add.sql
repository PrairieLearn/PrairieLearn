ALTER TABLE variants
ADD CONSTRAINT variants_modified_at_not_null CHECK (modified_at IS NOT NULL) NOT VALID;
