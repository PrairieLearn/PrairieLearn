ALTER TABLE topics
ADD CONSTRAINT topics_number_not_null CHECK (number IS NOT NULL) NOT VALID;
