CREATE TABLE course_agent_proposals (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES course_agent_conversations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  operation_id UUID NOT NULL UNIQUE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  payload JSONB NOT NULL,
  digest TEXT NOT NULL,
  decision BOOLEAN,
  prepared BOOLEAN NOT NULL DEFAULT false,
  published_sha TEXT,
  sync_job_sequence_id BIGINT REFERENCES job_sequences (id) ON DELETE SET NULL ON UPDATE CASCADE,
  synced_sha TEXT,
  outcome TEXT,
  outcome_success BOOLEAN,
  sync_validation_failed BOOLEAN NOT NULL DEFAULT false,
  sync_diagnostics TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    NOT delivered
    OR outcome IS NOT NULL
  ),
  CHECK ((outcome IS NULL) = (outcome_success IS NULL)),
  CHECK (
    published_sha IS NULL
    OR decision IS TRUE
  ),
  UNIQUE (conversation_id, sequence)
);

CREATE UNIQUE INDEX course_agent_proposals_pending_idx ON course_agent_proposals (conversation_id)
WHERE
  NOT delivered;
