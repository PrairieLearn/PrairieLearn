ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS show_onboarding BOOLEAN NOT NULL DEFAULT FALSE;