-- BLOCK select_rubric_id_from_grading
SELECT
  rubric_id
FROM
  rubric_gradings
WHERE
  id = $manual_rubric_grading_id
LIMIT
  1;
