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
