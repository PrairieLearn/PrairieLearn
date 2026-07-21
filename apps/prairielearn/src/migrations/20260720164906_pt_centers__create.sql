-- Mirror of PrairieTest-owned schema so PrairieLearn-only environments
-- (dev, tests) have it available. PrairieLearn reads the center/course opt-in
-- flags to decide whether to show the student "Report cheating" control.
-- Idempotent in case PrairieTest's migrations have already created it against
-- the shared database.
CREATE TABLE IF NOT EXISTS pt_centers (
  id bigserial PRIMARY KEY,
  cheating_reports_enabled boolean NOT NULL DEFAULT false
);

-- The shared database will already have `pt_centers` from PrairieTest's
-- schema; ensure the column exists there too.
ALTER TABLE IF EXISTS pt_centers
ADD COLUMN IF NOT EXISTS cheating_reports_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS pt_locations
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN IF NOT EXISTS center_id bigint REFERENCES pt_centers ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE IF EXISTS pt_courses
ADD COLUMN IF NOT EXISTS cheating_reports_enabled boolean NOT NULL DEFAULT false;
