CREATE TABLE IF NOT EXISTS ai_grading_credit_checkout_sessions (
  id bigserial PRIMARY KEY,
  stripe_object_id text NOT NULL UNIQUE,
  agent_user_id bigint NOT NULL,
  course_instance_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  data jsonb NOT NULL,
  amount_cents integer NOT NULL,
  credits_added boolean NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ai_grading_credit_checkout_sessions_agent_user_id_idx ON ai_grading_credit_checkout_sessions USING btree (agent_user_id);

CREATE INDEX IF NOT EXISTS ai_grading_credit_checkout_sessions_course_instance_id_idx ON ai_grading_credit_checkout_sessions USING btree (course_instance_id);
