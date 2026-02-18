ALTER TABLE zones
ADD CONSTRAINT zones_number_not_null CHECK (number IS NOT NULL) NOT VALID;
