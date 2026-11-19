-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;

-- BLOCK select_rubric_items
SELECT
  ri.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN rubric_items AS ri ON (ri.rubric_id = aq.manual_rubric_id)
WHERE
  iq.id = $iqId
  AND ri.deleted_at IS NULL
ORDER BY
  ri.number;
