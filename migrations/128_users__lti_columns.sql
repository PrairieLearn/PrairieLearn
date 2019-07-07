ALTER TABLE users ADD COLUMN IF NOT EXISTS lti_course_instance_id bigint REFERENCES course_instances(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lti_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lti_context_id text;
