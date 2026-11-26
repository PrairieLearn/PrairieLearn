CREATE TABLE assessment_instance_grace_saves (
  id UUID PRIMARY KEY,
  assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id BIGINT NOT NULL REFERENCES variants (id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  credit INTEGER,
  mode enum_mode
);

CREATE INDEX assessment_instance_grace_saves_instance_expires_at_idx ON assessment_instance_grace_saves (assessment_instance_id, expires_at);

CREATE INDEX assessment_instance_grace_saves_expires_at_idx ON assessment_instance_grace_saves (expires_at);
