CREATE TABLE lti_links (
  id bigserial PRIMARY KEY,
  course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  context_id TEXT,
  assessment_id BIGINT REFERENCES assessments ON DELETE CASCADE ON UPDATE CASCADE,
  resource_link_id TEXT,
  resource_link_title TEXT,
  resource_link_description TEXT,
  created_at timestamptz DEFAULT current_timestamp,
  deleted_at timestamptz NULL DEFAULT NULL
);

CREATE INDEX lti_links_resource_link_id_idx ON lti_links (resource_link_id);

ALTER TABLE lti_links
ADD CONSTRAINT course_instance_context_id_resource_link_id_key UNIQUE (course_instance_id, context_id, resource_link_id);
