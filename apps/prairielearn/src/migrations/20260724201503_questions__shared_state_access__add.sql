ALTER TABLE questions
ADD COLUMN IF NOT EXISTS shared_state_access jsonb NOT NULL DEFAULT '[]'::jsonb;
