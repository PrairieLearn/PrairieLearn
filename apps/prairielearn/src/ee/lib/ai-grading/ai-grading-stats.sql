-- BLOCK select_rubric_time
SELECT
  modified_at
FROM
  rubrics
WHERE
  id = $rubric_id;
