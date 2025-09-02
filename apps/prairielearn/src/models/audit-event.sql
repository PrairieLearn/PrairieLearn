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
  agent AS (
    SELECT
      user_id
    FROM
      users
    WHERE
      user_id = $agent_user_id
  ),
  subject AS (
    SELECT
      user_id
    FROM
      users
    WHERE
      user_id = $subject_user_id
  ),
  groups AS (
    SELECT
      id,
      course_instance_id
    FROM
      groups
    WHERE
      id = $group_id
  ),
  assessment_instance AS (
    SELECT
      id,
      assessment_id
    FROM
      assessment_instances
    WHERE
      id = $assessment_instance_id
  ),
  assessment_question AS (
    SELECT
      id,
      assessment_id
    FROM
      assessment_questions
    WHERE
      id = $assessment_question_id
  ),
  assessment AS (
    SELECT
      id,
      course_instance_id
    FROM
      assessments
    WHERE
      id = coalesce(
        $assessment_id,
        assessment_instance.assessment_id,
        assessment_question.assessment_id
      )
  ),
  course_instance AS (
    SELECT
      id,
      course_id
    FROM
      course_instances
    WHERE
      id = coalesce(
        $course_instance_id,
        groups.course_instance_id,
        assessment.course_instance_id
      )
  ),
  course AS (
    SELECT
      id,
      institution_id
    FROM
      pl_courses
    WHERE
      id = coalesce($course_id, course_instance.course_id)
  ),
  institution AS (
    SELECT
      id
    FROM
      institutions
    WHERE
      id = coalesce(
        $institution_id,
        subject.institution_id,
        course.institution_id
      )
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
    assessment_id,
    assessment_instance_id,
    assessment_question_id,
    group_id
  )
SELECT
  $action,
  $action_detail,
  $table_name,
  subject.user_id AS subject_user_id,
  course_instance.id AS course_instance_id,
  $row_id,
  $context,
  $old_row,
  $new_row,
  $agent_authn_user_id,
  agent.user_id AS agent_user_id,
  institution.id AS institution_id,
  course.id AS course_id,
  assessment.id AS assessment_id,
  assessment_instance.id AS assessment_instance_id,
  assessment_question.id AS assessment_question_id,
  groups.id AS group_id
FROM
  (
    SELECT
      1
  ) AS tmp -- dummy row to make the LEFT JOINs work
  LEFT JOIN subject ON (TRUE)
  LEFT JOIN course_instance ON (TRUE)
  LEFT JOIN agent ON (TRUE)
  LEFT JOIN institution ON (TRUE)
  LEFT JOIN course ON (TRUE)
  LEFT JOIN assessment ON (TRUE)
  LEFT JOIN assessment_instance ON (TRUE)
  LEFT JOIN assessment_question ON (TRUE)
  LEFT JOIN groups ON (TRUE)
RETURNING
  *;
