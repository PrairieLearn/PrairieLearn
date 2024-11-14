ALTER TABLE questions
ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS draft_number integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS draft_question_metadata (
  id bigserial NOT NULL PRIMARY KEY,
  question_id BIGINT REFERENCES questions (id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  updated_by BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TYPE ai_prompt_type AS ENUM(
  'initial_prompt',
  'human_revision',
  'autorevision'
);

CREATE TABLE IF NOT EXISTS ai_generation_prompts (
  id bigserial PRIMARY KEY,
  question_id BIGINT REFERENCES questions (id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompting_user_id BIGINT REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE,
  prompt_type ai_prompt_type NOT NULL,
  user_prompt text NOT NULL,
  context text NOT NULL,
  response text NOT NULL,
  title text,
  uuid text,
  html text NOT NULL,
  python text,
  errors jsonb,
  completion jsonb
);
