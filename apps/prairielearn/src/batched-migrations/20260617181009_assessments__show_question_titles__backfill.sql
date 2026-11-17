-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessments;

-- BLOCK update_assessments_show_question_titles
UPDATE assessments
SET
  show_question_titles = true
WHERE
  type = 'Homework'
  AND show_question_titles = false
  AND id >= $start
  AND id <= $end;
