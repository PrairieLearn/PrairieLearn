-- BLOCK select_audit_events_by_enrollment_id_table_names
SELECT
  *
FROM
  audit_events
WHERE
  enrollment_id = $enrollment_id
  AND table_name = ANY ($table_names::text[])
ORDER BY
  date DESC;

-- BLOCK select_audit_events_by_subject_user_id_table_names_course_instance_id
SELECT
  *
FROM
  audit_events
WHERE
  subject_user_id = $subject_user_id
  AND table_name = ANY ($table_names::text[])
  AND course_instance_id = $course_instance_id
ORDER BY
  date DESC;

-- BLOCK select_audit_events_by_agent_authn_user_id_table_names_course_instance_id
SELECT
  *
FROM
  audit_events
WHERE
  agent_authn_user_id = $agent_authn_user_id
  AND table_name = ANY ($table_names::text[])
  AND course_instance_id = $course_instance_id
ORDER BY
  date DESC;

-- BLOCK insert_audit_event
WITH
  assessment_instance_meta AS (
    SELECT
      id,
      team_id,
      assessment_id
    FROM
      assessment_instances
    WHERE
      id = $assessment_instance_id
      AND id IS NOT NULL
  ),
  enrollment_meta AS (
    SELECT
      id,
      course_instance_id
    FROM
      enrollments
    WHERE
      id = $enrollment_id
      AND id IS NOT NULL
  ),
  team_meta AS (
    SELECT
      id,
      (
        SELECT
          assessment_id
        FROM
          team_configs
        WHERE
          id = g.team_config_id
      ) AS assessment_id,
      course_instance_id
    FROM
      teams AS g
    WHERE
      id = coalesce(
        $team_id,
        (
          SELECT
            team_id
          FROM
            assessment_instance_meta
        )
      )
      AND id IS NOT NULL
  ),
  assessment_question_meta AS (
    SELECT
      id,
      assessment_id
    FROM
      assessment_questions
    WHERE
      id = $assessment_question_id
      AND id IS NOT NULL
  ),
  assessment_meta AS (
    SELECT
      id,
      course_instance_id
    FROM
      assessments
    WHERE
      id = coalesce(
        $assessment_id,
        (
          SELECT
            assessment_id
          FROM
            assessment_instance_meta
        ),
        (
          SELECT
            assessment_id
          FROM
            assessment_question_meta
        ),
        (
          SELECT
            assessment_id
          FROM
            team_meta
        )
      )
      AND id IS NOT NULL
  ),
  course_instance_meta AS (
    SELECT
      id,
      course_id
    FROM
      course_instances
    WHERE
      id = coalesce(
        $course_instance_id,
        (
          SELECT
            course_instance_id
          FROM
            enrollment_meta
        ),
        (
          SELECT
            course_instance_id
          FROM
            team_meta
        ),
        (
          SELECT
            course_instance_id
          FROM
            assessment_meta
        )
      )
      AND id IS NOT NULL
  ),
  course_meta AS (
    SELECT
      id,
      institution_id
    FROM
      courses
    WHERE
      id = coalesce(
        $course_id,
        (
          SELECT
            course_id
          FROM
            course_instance_meta
        )
      )
      AND id IS NOT NULL
  ),
  institution_meta AS (
    SELECT
      id
    FROM
      institutions
    WHERE
      id = coalesce(
        $institution_id,
        (
          SELECT
            institution_id
          FROM
            course_meta
        )
      )
      AND id IS NOT NULL
  )
INSERT INTO
  audit_events (
    action,
    action_detail,
    table_name,
    subject_user_id,
    course_instance_id,
    row_id,
    context,
    old_row,
    new_row,
    agent_authn_user_id,
    agent_user_id,
    institution_id,
    course_id,
    enrollment_id,
    assessment_id,
    assessment_instance_id,
    assessment_question_id,
    team_id
  )
SELECT
  $action,
  $action_detail,
  $table_name,
  $subject_user_id,
  course_instance_meta.id AS course_instance_id,
  $row_id,
  $context,
  $old_row,
  $new_row,
  $agent_authn_user_id,
  $agent_user_id,
  institution_meta.id AS institution_id,
  course_meta.id AS course_id,
  enrollment_meta.id AS enrollment_id,
  assessment_meta.id AS assessment_id,
  -- We coalesce here since it is possible that assessment_instance_meta.id is null, and $assessment_instance_id is not null.
  -- There is no foreign key constraint on assessment_instance_id since it can be hard-deleted, and we want to preserve the nonexistent ID for auditing.
  coalesce(
    assessment_instance_meta.id,
    $assessment_instance_id
  ) AS assessment_instance_id,
  assessment_question_meta.id AS assessment_question_id,
  team_meta.id AS team_id
FROM
  (
    SELECT
      1
  ) AS tmp -- dummy row to make the LEFT JOINs work
  LEFT JOIN course_instance_meta ON (TRUE)
  LEFT JOIN institution_meta ON (TRUE)
  LEFT JOIN course_meta ON (TRUE)
  LEFT JOIN enrollment_meta ON (TRUE)
  LEFT JOIN assessment_meta ON (TRUE)
  LEFT JOIN assessment_instance_meta ON (TRUE)
  LEFT JOIN assessment_question_meta ON (TRUE)
  LEFT JOIN team_meta ON (TRUE)
RETURNING
  *;
