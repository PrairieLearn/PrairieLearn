-- BLOCK insert_ai_submission_group
INSERT INTO
  ai_submission_groups (
    assessment_question_id,
    submission_group_name,
    submission_group_description
  )
VALUES
  (
    $assessment_question_id,
    $submission_group_name,
    $submission_group_description
  );

-- BLOCK select_assessment_question_has_ai_submission_groups
SELECT
  EXISTS (
    SELECT
      1
    FROM
      ai_submission_groups
    WHERE
      assessment_question_id = $assessment_question_id
  );

-- BLOCK select_ai_submission_group
SELECT
  *
FROM
  ai_submission_groups
WHERE
  id = $ai_submission_group_id;

-- BLOCK select_ai_submission_groups
SELECT
  *
FROM
  ai_submission_groups
WHERE
  assessment_question_id = $assessment_question_id;

-- BLOCK update_instance_question_ai_submission_group
UPDATE instance_questions
SET
  ai_submission_group_id = $ai_submission_group_id
WHERE
  id = $instance_question_id;

-- BLOCK reset_instance_questions_ai_submission_groups
WITH
  updated AS (
    UPDATE instance_questions
    SET
      ai_submission_group_id = NULL
    WHERE
      assessment_question_id = $assessment_question_id
    RETURNING
      *
  )
SELECT
  COUNT(*)::int
FROM
  updated;
