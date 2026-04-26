ALTER TABLE assessment_access_control_prairietest_exams
ADD COLUMN after_complete_questions_hidden boolean NOT NULL DEFAULT FALSE,
ADD COLUMN after_complete_score_hidden boolean NOT NULL DEFAULT FALSE;

-- A readOnly PT reservation is a review environment that always shows
-- everything, so we don't support combining it with afterComplete settings
-- that hide questions or the score.
ALTER TABLE assessment_access_control_prairietest_exams
-- Modern access control is not yet in general use, so this table is
-- effectively empty; skipping NOT VALID is safe here.
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT aac_prairietest_exams_readonly_no_hide_check CHECK (
  NOT read_only
  OR (
    NOT after_complete_questions_hidden
    AND NOT after_complete_score_hidden
  )
);

-- Hiding the score while showing questions isn't supported — we would have
-- to render submissions without their score badges.
ALTER TABLE assessment_access_control_prairietest_exams
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT aac_prairietest_exams_score_requires_questions_hide_check CHECK (
  after_complete_questions_hidden
  OR NOT after_complete_score_hidden
);
