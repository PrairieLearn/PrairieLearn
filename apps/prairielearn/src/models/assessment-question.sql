-- BLOCK select_assessment_question_by_id
SELECT
  *
FROM
  assessment_questions
WHERE
  id = $id;

-- BLOCK select_assessment_question_by_question_id
SELECT
  *
FROM
  assessment_questions
WHERE
  assessment_id = $assessment_id
  AND question_id = $question_id;
