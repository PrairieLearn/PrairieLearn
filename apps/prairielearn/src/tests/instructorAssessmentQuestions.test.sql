-- BLOCK clear_question_reference
UPDATE assessment_questions
SET
  json_qid = NULL
WHERE
  assessment_id = $assessment_id
  AND json_qid = $qid
  AND deleted_at IS NULL;

-- BLOCK update_course_sharing_name
UPDATE courses
SET
  sharing_name = $sharing_name
WHERE
  id = $course_id;
