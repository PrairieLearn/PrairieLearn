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
  rubric_items AS ri
  JOIN rubrics AS r ON r.id = ri.rubric_id
  JOIN assessment_questions AS aq ON aq.manual_rubric_id = r.id
WHERE
  aq.id = $assessment_question_id
ORDER BY
  ri.number;
