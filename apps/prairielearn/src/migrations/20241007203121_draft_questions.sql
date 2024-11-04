ALTER TABLE questions
ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT (false);

ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS draft_number integer NOT NULL DEFAULT (0);

CREATE TABLE IF NOT EXISTS questions_draft_metadata (
  id bigint NOT NULL PRIMARY KEY,
  draft_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  draft_created_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  draft_updated_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TYPE ai_prompt_type AS ENUM(
  'initial_prompt',
  'human_revision',
  'autorevision'
);

CREATE TABLE IF NOT EXISTS ai_generation_prompts (
  id bigserial PRIMARY KEY,
  question_id BIGINT REFERENCES questions (id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompting_user BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompt_type ai_prompt_type,
  user_prompt text,
  context text,
  response text,
  title text,
  uuid text,
  html text,
  python text,
  errors jsonb,
  completion jsonb
);
