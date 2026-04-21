ALTER TABLE assessment_access_control_prairietest_exams
ADD COLUMN after_complete_questions_hidden boolean,
ADD COLUMN after_complete_score_hidden boolean;

-- `read_only` and `afterComplete` are mutually exclusive: a readOnly PT
-- reservation represents a review environment that always shows everything,
-- so configuring hiding makes no sense. Additionally, hiding the score while
-- showing the questions is nonsensical (the student would see their
-- submission but not the corresponding grade).
--
-- Modern access control is not yet in general use, so this table is
-- effectively empty; skipping NOT VALID is safe here.
ALTER TABLE assessment_access_control_prairietest_exams
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT aac_prairietest_exams_after_complete_check CHECK (
  (
    read_only = TRUE
    AND after_complete_questions_hidden IS NULL
    AND after_complete_score_hidden IS NULL
  )
  OR (
    read_only = FALSE
    AND NOT (
      after_complete_score_hidden IS TRUE
      AND after_complete_questions_hidden IS NOT TRUE
    )
  )
);
