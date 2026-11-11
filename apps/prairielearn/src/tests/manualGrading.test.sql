-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;

-- BLOCK select_rubric_items
SELECT
  *
FROM
  rubric_items
WHERE
  id = ANY ($ids::bigint[]);
