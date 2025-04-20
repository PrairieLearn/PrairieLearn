-- BLOCK insert_audit_log
INSERT INTO
  audit_logs (
    action,
    authn_user_id,
    column_name,
    course_id,
    course_instance_id,
    group_id,
    institution_id,
    new_state,
    old_state,
    parameters,
    row_id,
    table_name,
    user_id
  )
VALUES
  (
    $action,
    $authn_user_id,
    $column_name,
    $course_id,
    $course_instance_id,
    $group_id,
    $institution_id,
    $new_state,
    $old_state,
    $parameters,
    $row_id,
    $table_name,
    $user_id
  )
RETURNING
  *;
