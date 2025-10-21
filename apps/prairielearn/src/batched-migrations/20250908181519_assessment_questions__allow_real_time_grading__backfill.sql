-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessment_questions;

-- BLOCK update_assessment_questions
UPDATE assessment_questions
SET
  allow_real_time_grading = assessments.allow_real_time_grading
FROM
  assessments
WHERE
  assessment_questions.assessment_id = assessments.id
  AND assessment_questions.allow_real_time_grading IS NULL
  AND assessment_questions.id >= $start
  AND assessment_questions.id <= $end;
