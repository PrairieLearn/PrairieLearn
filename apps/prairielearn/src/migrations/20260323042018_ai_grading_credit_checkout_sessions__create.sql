CREATE TABLE IF NOT EXISTS ai_grading_credit_checkout_sessions (
  id bigserial PRIMARY KEY,
  stripe_object_id text NOT NULL UNIQUE,
  agent_user_id bigint NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  course_instance_id bigint NOT NULL REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  data jsonb NOT NULL,
  amount_milli_dollars bigint NOT NULL CHECK (amount_milli_dollars > 0),
  credits_added boolean NOT NULL DEFAULT FALSE,
  refunded_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_grading_credit_checkout_sessions_agent_user_id_idx ON ai_grading_credit_checkout_sessions USING btree (agent_user_id);

CREATE INDEX IF NOT EXISTS ai_grading_credit_checkout_sessions_course_instance_id_idx ON ai_grading_credit_checkout_sessions USING btree (course_instance_id);

ALTER TABLE ai_grading_credit_pool_changes
ADD COLUMN IF NOT EXISTS checkout_session_id BIGINT;

ALTER TABLE ai_grading_credit_pool_changes
ADD CONSTRAINT ai_grading_credit_pool_changes_checkout_session_id_fkey FOREIGN KEY (checkout_session_id) REFERENCES ai_grading_credit_checkout_sessions (id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
