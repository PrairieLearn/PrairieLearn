CREATE TYPE enum_course_agent_review_decision AS ENUM('approved', 'denied');

CREATE TABLE IF NOT EXISTS course_agent_reviews (
  id bigserial PRIMARY KEY,
  course_agent_conversation_id bigint NOT NULL REFERENCES course_agent_conversations ON UPDATE CASCADE ON DELETE CASCADE,
  -- Names the review in the course agent service, which holds its snapshot.
  agent_review_id uuid NOT NULL,
  decision enum_course_agent_review_decision NOT NULL,
  -- The editor job that saves an approval; null once that job is deleted.
  job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE SET NULL,
  -- The outcome reported to the agent, recorded once the decision or job has finished.
  result jsonb,
  -- Set once the course agent service acknowledges the result, or refuses it as different from
  -- one it already has.
  result_delivered_at timestamptz,
  -- Set when the sweeper stopped resending an unacknowledged result; Resume can still send it.
  delivery_expired_at timestamptz,
  -- Set when an undelivered result was reported as stuck, so it is reported once.
  stuck_delivery_reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_agent_reviews_conversation_review_key UNIQUE (course_agent_conversation_id, agent_review_id),
  CONSTRAINT course_agent_reviews_denial_has_no_job CHECK (
    decision = 'approved'
    OR job_sequence_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS course_agent_reviews_undelivered_idx ON course_agent_reviews (id)
WHERE
  result_delivered_at IS NULL
  AND delivery_expired_at IS NULL;
