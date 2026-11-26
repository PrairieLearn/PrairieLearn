CREATE TABLE IF NOT EXISTS unsaved_submissions (
  id bigserial PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_submitted_answer jsonb NOT NULL,
  variant_id bigint NOT NULL REFERENCES variants ON UPDATE CASCADE ON DELETE CASCADE,
  instance_question_id bigint NOT NULL REFERENCES instance_questions ON UPDATE CASCADE ON DELETE CASCADE,
  credit integer,
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  uuid uuid NOT NULL,
  UNIQUE (instance_question_id, user_id)
);

CREATE INDEX IF NOT EXISTS unsaved_submissions_variant_id_idx ON unsaved_submissions (variant_id);

CREATE INDEX IF NOT EXISTS unsaved_submissions_user_id_idx ON unsaved_submissions (user_id);

CREATE TABLE IF NOT EXISTS unsaved_submission_states (
  id bigserial PRIMARY KEY,
  instance_question_id bigint NOT NULL REFERENCES instance_questions ON UPDATE CASCADE ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  generation integer NOT NULL DEFAULT 0,
  discarded_uuids uuid[] NOT NULL DEFAULT '{}',
  UNIQUE (instance_question_id, user_id)
);

CREATE INDEX IF NOT EXISTS unsaved_submission_states_user_id_idx ON unsaved_submission_states (user_id);
