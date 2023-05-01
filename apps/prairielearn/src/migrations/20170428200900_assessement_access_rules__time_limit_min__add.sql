ALTER TABLE assessment_access_rules
ADD COLUMN IF NOT EXISTS time_limit_min integer;
