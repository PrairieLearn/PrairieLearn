CREATE TABLE IF NOT EXISTS shared_state_object_revisions (
  id bigserial PRIMARY KEY,
  shared_state_object_id bigint NOT NULL REFERENCES shared_state_objects (id) ON UPDATE CASCADE ON DELETE CASCADE,
  data_version integer NOT NULL,
  scope text NOT NULL,
  properties jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shared_state_object_revisions_scope_check CHECK (
    scope IN ('assessment_instance', 'course_instance')
  )
);

CREATE INDEX IF NOT EXISTS shared_state_object_revisions_shared_state_object_id_idx ON shared_state_object_revisions USING btree (shared_state_object_id);
