CREATE TYPE enum_course_agent_review_decision AS ENUM('approved', 'denied');

CREATE TABLE IF NOT EXISTS course_agent_reviews (
  id bigserial PRIMARY KEY,
  course_agent_conversation_id bigint NOT NULL REFERENCES course_agent_conversations ON UPDATE CASCADE ON DELETE CASCADE,
  -- Names the review in the course agent service, which holds its snapshot.
  agent_review_id uuid NOT NULL,
  decision enum_course_agent_review_decision NOT NULL,
  -- The editor job that saves an approval.
  job_sequence_id bigint REFERENCES job_sequences ON UPDATE CASCADE ON DELETE CASCADE,
  -- The outcome reported to the agent, recorded once the decision or job has finished.
  result jsonb,
  -- Set once the course agent service acknowledges the result.
  result_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_agent_reviews_conversation_review_key UNIQUE (course_agent_conversation_id, agent_review_id),
  CONSTRAINT course_agent_reviews_approval_has_job CHECK (
    (decision = 'approved') = (job_sequence_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS course_agent_reviews_undelivered_idx ON course_agent_reviews (id)
WHERE
  result_delivered_at IS NULL;
