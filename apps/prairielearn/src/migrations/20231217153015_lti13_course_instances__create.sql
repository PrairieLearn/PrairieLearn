CREATE TABLE IF NOT EXISTS
  lti13_course_instances (
    --ags_lineitems text,
    --ags_lineitem text,
    context_id text NOT NULL,
    context_label text,
    context_title text,
    course_instance_id BIGINT NOT NULL REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    deleted_at timestamptz,
    deployment_id text NOT NULL,
    id bigserial PRIMARY KEY,
    lti13_instance_id BIGINT REFERENCES lti13_instances ON DELETE CASCADE ON UPDATE CASCADE
    --nrps_context_memberships_url text,
    --preferences jsonb,
  );

ALTER TABLE lti13_course_instances
ADD CONSTRAINT lti13_course_instances_unique_idx UNIQUE NULLS NOT DISTINCT (
  lti13_instance_id,
  deployment_id,
  context_id,
  deleted_at
);

CREATE INDEX IF NOT EXISTS lti13_course_instances_course_instance_id_idx ON lti13_course_instances (course_instance_id);
