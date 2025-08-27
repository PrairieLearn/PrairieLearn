-- BLOCK insert_audit_event
INSERT INTO
  audit_events (
    action,
    action_detail,
    agent_authn_user_id,
    agent_user_id,
    assessment_id,
    assessment_instance_id,
    assessment_question_id,
    context,
    course_id,
    course_instance_id,
    date,
    group_id,
    institution_id,
    new_row,
    old_row,
    row_id,
    subject_user_id,
    table_name
  )
VALUES
  (
    $action::audit_event_action,
    $action_detail,
    $agent_authn_user_id::bigint,
    $agent_user_id::bigint,
    $assessment_id::bigint,
    $assessment_instance_id::bigint,
    $assessment_question_id::bigint,
    $context::jsonb,
    $course_id::bigint,
    $course_instance_id::bigint,
    CURRENT_TIMESTAMP,
    $group_id::bigint,
    $institution_id::bigint,
    $new_row::jsonb,
    $old_row::jsonb,
    $row_id::bigint,
    $subject_user_id::bigint,
    $table_name
  )
RETURNING *;
