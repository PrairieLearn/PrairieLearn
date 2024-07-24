ALTER TABLE lti13_course_instances
ADD COLUMN IF NOT EXISTS lineitems TEXT,
ADD COLUMN IF NOT EXISTS context_memberships_url TEXT;

CREATE TABLE IF NOT EXISTS lti13_lineitems (
  lti13_course_instance_id BIGINT REFERENCES lti13_course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  lineitem_id text,
  lineitem jsonb,
  last_lineitem_activity timestamp with time zone,
  last_membership_activity timestamp with time zone,
  last_score_activity timestamp with time zone,
  PRIMARY KEY (lti13_course_instance_id, lineitem_id)
);
