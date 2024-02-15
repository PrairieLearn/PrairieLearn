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
  ),
  inserted_audit_logs AS (
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
      inserted_course_permissions AS cp
  )
SELECT
  *
FROM
  inserted_course_permissions;
