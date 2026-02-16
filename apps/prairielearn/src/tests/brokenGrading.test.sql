-- BLOCK get_last_submission_by_instance_question
SELECT
  s.broken
FROM
  submissions AS s
  JOIN variants AS v ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  s.date DESC
LIMIT
  1;
