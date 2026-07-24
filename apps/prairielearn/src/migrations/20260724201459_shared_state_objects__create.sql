CREATE TABLE IF NOT EXISTS shared_state_objects (
  id bigserial PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_state_objects_course_id_name_key ON shared_state_objects USING btree (course_id, name);
