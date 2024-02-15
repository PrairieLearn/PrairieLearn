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
  ),
  existing_not_updated_course_permissions AS (
    -- If the course permission already existed but was not updated, select it
    -- to be returned.
    SELECT
      *
    FROM
      course_permissions AS cp
    WHERE
      cp.user_id = $user_id
      AND cp.course_id = $course_id
      AND NOT EXISTS (
        SELECT
          1
        FROM
          inserted_course_permissions
      )
  )
SELECT
  *
FROM
  inserted_course_permissions
UNION ALL
SELECT
  *
FROM
  existing_not_updated_course_permissions;
