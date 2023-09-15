UPDATE assessment_questions
SET
  effective_advance_score_perc = 0
WHERE
  effective_advance_score_perc IS NULL;
