-- BLOCK select_unsaved_submission
SELECT
  *
FROM
  unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id;

-- BLOCK close_assessment_instance
UPDATE assessment_instances
SET
  open = FALSE
WHERE
  id = (
    SELECT
      assessment_instance_id
    FROM
      instance_questions
    WHERE
      id = $instance_question_id
  );
