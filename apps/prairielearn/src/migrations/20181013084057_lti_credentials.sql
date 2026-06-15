CREATE TABLE lti_credentials (
  id bigserial PRIMARY KEY,
  course_instance_id BIGINT REFERENCES course_instances ON DELETE CASCADE ON UPDATE CASCADE,
  consumer_key TEXT,
  secret TEXT,
  created_at timestamptz DEFAULT current_timestamp,
  deleted_at timestamptz NULL DEFAULT NULL
);

CREATE INDEX lti_credentials_consumer_key_idx ON lti_credentials (consumer_key);
