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
VALUES
  (
    $action,
    $action_detail,
    $table_name,
    $subject_user_id,
    $course_instance_id,
    $row_id,
    $context,
    $old_row,
    $new_row,
    $agent_authn_user_id,
    $agent_user_id,
    $institution_id,
    $course_id,
    $assessment_id,
    $assessment_instance_id,
    $assessment_question_id,
    $group_id
  )
RETURNING
  *;
