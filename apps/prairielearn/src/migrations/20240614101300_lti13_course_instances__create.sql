CREATE TABLE IF NOT EXISTS lti13_course_instances (
  context_id text NOT NULL,
  context_label text,
  context_title text,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  deployment_id text NOT NULL,
  id bigserial PRIMARY KEY,
  lti13_instance_id BIGINT REFERENCES lti13_instances ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE lti13_course_instances
ADD CONSTRAINT lti13_course_instances_unique_idx UNIQUE NULLS NOT DISTINCT (lti13_instance_id, deployment_id, context_id);

CREATE INDEX IF NOT EXISTS lti13_course_instances_course_instance_id_idx ON lti13_course_instances (course_instance_id);
