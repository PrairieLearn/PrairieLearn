ALTER TABLE lti13_course_instances
ADD COLUMN IF NOT EXISTS lineitems_url TEXT;

CREATE TABLE IF NOT EXISTS lti13_assessments (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL UNIQUE REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  last_activity timestamp with time zone NOT NULL DEFAULT NOW(),
  lti13_course_instance_id BIGINT NOT NULL REFERENCES lti13_course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  lineitem_id_url text NOT NULL,
  lineitem jsonb NOT NULL,
  UNIQUE (lti13_course_instance_id, lineitem_id_url)
);
