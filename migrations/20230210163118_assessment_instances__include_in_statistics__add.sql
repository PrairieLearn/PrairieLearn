ALTER TABLE assessment_instances ADD COLUMN IF EXISTS NOT EXISTS include_in_statistics boolean NOT NULL DEFAULT TRUE;
