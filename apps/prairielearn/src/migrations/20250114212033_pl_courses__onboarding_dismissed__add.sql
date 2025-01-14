ALTER TABLE pl_courses
ADD COLUMN IF NOT EXISTS onboarding_dismissed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE pl_courses
SET
  onboarding_dismissed = TRUE;
