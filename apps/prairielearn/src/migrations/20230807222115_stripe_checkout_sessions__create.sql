CREATE TABLE IF NOT EXISTS stripe_checkout_sessions (
  id BIGSERIAL PRIMARY KEY,
  stripe_object_id TEXT NOT NULL UNIQUE,
  agent_user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_instance_id BIGINT REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  subject_user_id BIGINT NOT NULL REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  data JSONB NOT NULL,
  plan_names TEXT[] NOT NULL,
  plan_grants_created BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS stripe_checkout_sessions_subject_user_id_idx ON stripe_checkout_sessions (subject_user_id);

CREATE INDEX IF NOT EXISTS stripe_checkout_sessions_agent_user_id_idx ON stripe_checkout_sessions (agent_user_id);
