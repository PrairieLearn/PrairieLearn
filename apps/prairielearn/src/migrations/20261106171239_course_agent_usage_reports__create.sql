CREATE TABLE IF NOT EXISTS course_agent_usage_reports (
  id bigserial PRIMARY KEY,
  course_agent_conversation_id bigint NOT NULL REFERENCES course_agent_conversations ON UPDATE CASCADE ON DELETE CASCADE,
  -- The conversation's owner, copied so hourly spending can be summed per user.
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  -- Minted by the course agent service when it freezes a report, so a retried report is
  -- recognized rather than counted twice.
  report_id uuid NOT NULL,
  model text NOT NULL,
  input_tokens bigint NOT NULL CHECK (input_tokens >= 0),
  input_tokens_cache_read bigint NOT NULL CHECK (input_tokens_cache_read >= 0),
  output_tokens bigint NOT NULL CHECK (output_tokens >= 0),
  output_tokens_reasoning bigint NOT NULL CHECK (output_tokens_reasoning >= 0),
  -- Priced by PrairieLearn when the report is recorded.
  cost_milli_dollars bigint NOT NULL CHECK (cost_milli_dollars >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_agent_usage_reports_conversation_report_key UNIQUE (course_agent_conversation_id, report_id)
);

CREATE INDEX IF NOT EXISTS course_agent_usage_reports_user_id_created_at_idx ON course_agent_usage_reports (user_id, created_at);
