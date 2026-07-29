CREATE TABLE IF NOT EXISTS shared_state_objects (
  id bigserial PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL,
  current_revision_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_state_objects_course_id_name_key ON shared_state_objects USING btree (course_id, name);

CREATE TABLE IF NOT EXISTS shared_state_object_revisions (
  id bigserial PRIMARY KEY,
  shared_state_object_id bigint NOT NULL REFERENCES shared_state_objects (id) ON UPDATE CASCADE ON DELETE CASCADE,
  data_version integer NOT NULL,
  scope text NOT NULL,
  properties jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_state_object_revisions_scope_check CHECK (
    scope IN ('assessment_instance', 'course_instance')
  )
);

CREATE INDEX IF NOT EXISTS shared_state_object_revisions_shared_state_object_id_idx ON shared_state_object_revisions USING btree (shared_state_object_id);

ALTER TABLE shared_state_objects
ADD CONSTRAINT shared_state_objects_current_revision_id_fkey FOREIGN KEY (current_revision_id) REFERENCES shared_state_object_revisions (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS assessment_instance_shared_state_values (
  id bigserial PRIMARY KEY,
  assessment_instance_id bigint NOT NULL REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  shared_state_object_id bigint NOT NULL REFERENCES shared_state_objects (id) ON UPDATE CASCADE ON DELETE CASCADE,
  revision_id bigint NOT NULL REFERENCES shared_state_object_revisions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  write_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assessment_instance_shared_state_values_ai_id_object_id_key ON assessment_instance_shared_state_values USING btree (assessment_instance_id, shared_state_object_id);

CREATE TABLE IF NOT EXISTS user_shared_state_values (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  shared_state_object_id bigint NOT NULL REFERENCES shared_state_objects (id) ON UPDATE CASCADE ON DELETE CASCADE,
  revision_id bigint NOT NULL REFERENCES shared_state_object_revisions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  write_seq integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_shared_state_values_user_id_object_id_key ON user_shared_state_values USING btree (user_id, shared_state_object_id);

ALTER TABLE questions
ADD COLUMN IF NOT EXISTS shared_state_access jsonb NOT NULL DEFAULT '[]'::jsonb;
