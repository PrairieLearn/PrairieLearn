ALTER TABLE assessment_instances
ADD COLUMN IF NOT EXISTS include_in_statistics boolean NOT NULL DEFAULT TRUE;
