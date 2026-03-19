-- BLOCK select_ai_grading_messages
SELECT
  *
FROM
  ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id
ORDER BY
  created_at ASC,
  id ASC;

-- BLOCK delete_ai_grading_messages
DELETE FROM ai_grading_messages
WHERE
  assessment_question_id = $assessment_question_id;
