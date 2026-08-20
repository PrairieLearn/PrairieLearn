-- BLOCK select_first_instance_question
SELECT
  id
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id
ORDER BY
  id
LIMIT
  1;

-- BLOCK enable_group_work
WITH
  enabled AS (
    UPDATE assessments
    SET
      team_work = TRUE
    WHERE
      id = $assessment_id
    RETURNING
      course_instance_id
  )
INSERT INTO
  team_configs (
    course_instance_id,
    assessment_id,
    maximum,
    minimum,
    student_authz_create,
    student_authz_choose_name,
    student_authz_join,
    student_authz_leave,
    has_roles
  )
SELECT
  course_instance_id,
  $assessment_id,
  3,
  1,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  FALSE
FROM
  enabled
ON CONFLICT (assessment_id) DO NOTHING;

-- BLOCK disable_group_work
UPDATE assessments
SET
  team_work = FALSE
WHERE
  id = $assessment_id;
