-- BLOCK insert_instance_question_group
INSERT INTO
  instance_question_groups (
    assessment_question_id,
    instance_question_group_description,
    instance_question_group_name
  )
VALUES
  (
    $assessment_question_id,
    $instance_question_group_description,
    $instance_question_group_name
  );

-- BLOCK select_assessment_question_has_instance_question_groups
SELECT
  EXISTS (
    SELECT
      1
    FROM
      instance_question_groups
    WHERE
      assessment_question_id = $assessment_question_id
  );

-- BLOCK select_instance_question_group
SELECT
  *
FROM
  instance_question_groups
WHERE
  id = $instance_question_group_id;

-- BLOCK select_instance_question_groups
SELECT
  *
FROM
  instance_question_groups
WHERE
  assessment_question_id = $assessment_question_id;

-- BLOCK update_instance_question_ai_instance_question_group
UPDATE instance_questions
SET
  ai_instance_question_group_id = $ai_instance_question_group_id
WHERE
  id = $instance_question_id;

-- BLOCK update_instance_question_manual_instance_question_group
UPDATE instance_questions
SET
  manual_instance_question_group_id = $manual_instance_question_group_id
WHERE
  id = $instance_question_id;

-- BLOCK delete_ai_instance_question_groups
WITH
  updated AS (
    UPDATE instance_questions
    SET
      ai_instance_question_group_id = NULL
    WHERE
      assessment_question_id = $assessment_question_id
    RETURNING
      *
  )
SELECT
  COUNT(*)::int
FROM
  updated;
