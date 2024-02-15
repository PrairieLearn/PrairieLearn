-- BLOCK insert_course_permissions
WITH
  inserted_course_permissions AS (
    INSERT INTO
      course_permissions AS cp (user_id, course_id, course_role)
    VALUES
      ($user_id, $course_id, $course_role)
    ON CONFLICT (user_id, course_id) DO
    UPDATE
    SET
      course_role = EXCLUDED.course_role
    WHERE
      cp.course_role < EXCLUDED.course_role
    RETURNING
      cp.*
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    course_id,
    user_id,
    table_name,
    row_id,
    action,
    new_state
  )
SELECT
  $authn_user_id,
  cp.course_id,
  cp.user_id,
  'course_permissions',
  cp.id,
  'insert',
  to_jsonb(cp)
FROM
  inserted_course_permissions AS cp;

-- BLOCK update_course_permissions_role
WITH
  updated_course_permissions AS (
    UPDATE course_permissions AS cp
    SET
      course_role = $course_role
    WHERE
      cp.user_id = $user_id
      AND cp.course_id = $course_id
    RETURNING
      cp.*
  ),
  inserted_audit_log AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        course_id,
        user_id,
        table_name,
        column_name,
        row_id,
        action,
        parameters,
        new_state
      )
    SELECT
      $authn_user_id,
      cp.course_id,
      cp.user_id,
      'course_permissions',
      'course_role',
      cp.id,
      'update',
      jsonb_build_object('course_role', $course_role),
      to_jsonb(cp)
    FROM
      updated_course_permissions AS cp
  )
SELECT
  *
FROM
  updated_course_permissions;
