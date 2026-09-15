-- PrairieLearn tests do not run PrairieTest migrations; production shares the schema.
CREATE TABLE IF NOT EXISTS pt_centers (id bigserial PRIMARY KEY);

ALTER TABLE IF EXISTS pt_centers
ADD COLUMN IF NOT EXISTS cheating_reports_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS pt_locations
-- The column is added in the same statement as the constraint, so every existing
-- row is `NULL` and there is nothing for Postgres to validate.
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN IF NOT EXISTS center_id bigint REFERENCES pt_centers ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE IF EXISTS pt_courses
ADD COLUMN IF NOT EXISTS cheating_reports_enabled boolean NOT NULL DEFAULT false;
