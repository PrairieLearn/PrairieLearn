ALTER TABLE questions
ADD COLUMN IF NOT EXISTS workspace_url_rewrite boolean DEFAULT true;
