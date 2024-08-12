-- BLOCK update_question_manual_perc
UPDATE questions
SET
  manual_perc = CASE
    WHEN grading_method = 'Manual' THEN 100
    ELSE 0
  END
WHERE
  manual_perc IS NULL
  AND id BETWEEN $min AND $max;
