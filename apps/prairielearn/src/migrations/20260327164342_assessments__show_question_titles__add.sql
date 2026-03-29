ALTER TABLE assessments
ADD COLUMN IF NOT EXISTS show_question_titles boolean NOT NULL DEFAULT false;
