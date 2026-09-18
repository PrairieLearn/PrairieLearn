-- BLOCK select_questions
-- Match the saved form, including questions removed from the current assessment.
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course,
  to_jsonb(aq.*) AS assessment_question,
  qo.question_number
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN courses AS c ON c.id = q.course_id
  JOIN question_order ($assessment_instance_id) AS qo ON qo.instance_question_id = iq.id
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  qo.row_order;
