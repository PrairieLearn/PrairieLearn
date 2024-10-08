-- BLOCK update_assessment_question_manual_perc
UPDATE assessment_questions
SET
  manual_perc = 100 * max_manual_points / COALESCE(NULLIF(max_points, 0), 1)
WHERE
  manual_perc IS NULL
  AND id BETWEEN $min AND $max;
