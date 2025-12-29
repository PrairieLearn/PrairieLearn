-- BLOCK select_rubric
SELECT
  r.*
FROM
  rubrics AS r
  JOIN assessment_questions AS aq ON aq.manual_rubric_id = r.id
WHERE
  aq.id = $assessment_question_id;

-- BLOCK select_rubric_items
SELECT
  ri.*
FROM
  assessment_questions AS aq
  JOIN rubric_items AS ri ON aq.manual_rubric_id = ri.rubric_id
WHERE
  aq.id = $assessment_question_id
  AND ri.deleted_at IS NULL
ORDER BY
  ri.number;
