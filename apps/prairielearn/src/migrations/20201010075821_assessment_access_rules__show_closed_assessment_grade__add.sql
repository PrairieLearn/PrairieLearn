ALTER TABLE assessment_access_rules
ADD COLUMN show_closed_assessment_score boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS authz_assessment_instance (
  bigint,
  jsonb,
  timestamp with time zone,
  text,
  boolean
);
