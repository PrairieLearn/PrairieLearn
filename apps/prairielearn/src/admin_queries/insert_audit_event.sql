-- BLOCK insert_audit_event
INSERT INTO
  audit_events (
    subject_user_id,
    course_instance_id,
    table_name,
    action,
    action_detail,
    row_id,
    agent_user_id,
    agent_authn_user_id,
    context,
    date
  )
VALUES
  (
    $subject_user_id::bigint,
    $course_instance_id::bigint,
    $table_name,
    $action::audit_event_action,
    $action_detail,
    $row_id::bigint,
    $agent_user_id::bigint,
    $agent_authn_user_id::bigint,
    '{}'::jsonb,
    CURRENT_TIMESTAMP
  )
RETURNING
  id,
  subject_user_id,
  course_instance_id,
  table_name,
  action,
  action_detail,
  row_id,
  agent_user_id,
  agent_authn_user_id,
  date;
