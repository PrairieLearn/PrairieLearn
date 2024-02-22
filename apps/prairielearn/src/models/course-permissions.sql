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

-- BLOCK delete_course_permissions
WITH
  deleted_course_permissions AS (
    DELETE FROM course_permissions AS cp
    WHERE
      cp.user_id = ANY ($user_ids::bigint[])
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
        row_id,
        action,
        old_state
      )
    SELECT
      $authn_user_id,
      cp.course_id,
      cp.user_id,
      'course_permissions',
      cp.id,
      'delete',
      to_jsonb(cp)
    FROM
      deleted_course_permissions AS cp
  ),
  deleted_enrollments AS (
    -- Delete all enrollments of this user from instances of the course, for two
    -- reasons:
    -- 1) So they will still be ignored when computing statistics. Only users
    --    who are enrolled and who do not have access to course content or
    --    student data are considered when computing statistics.
    -- 2) So their role, displayed in the list of assessment instances, will
    --    change from "Staff" to "None" instead of to "Student".
    DELETE FROM enrollments AS e USING course_instances AS ci
    WHERE
      ci.id = e.course_instance_id
      AND e.user_id = ANY ($user_ids::bigint[])
      AND ci.course_id = $course_id
    RETURNING
      e.*
  )
SELECT
  *
FROM
  deleted_course_permissions;

-- BLOCK select_and_lock_non_owners
SELECT
  *
FROM
  course_permissions AS cp
WHERE
  cp.course_id = $course_id
  AND cp.course_role != 'Owner'
FOR NO KEY UPDATE OF
  cp;

-- BLOCK select_and_lock_course_permissions_without_access
WITH
  ci_permissions_by_cp AS (
    SELECT
      cip.course_permission_id,
      MAX(cip.course_instance_role) AS max_course_instance_role
    FROM
      course_instance_permissions AS cip
      JOIN course_permissions AS cp ON (cip.course_permission_id = cp.id)
    WHERE
      cp.course_id = $course_id
      AND cip.course_instance_role != 'None'
    GROUP BY
      cip.course_permission_id
  )
SELECT
  cp.*
FROM
  course_permissions AS cp
  LEFT JOIN ci_permissions_by_cp AS cip ON (cp.id = cip.course_permission_id)
WHERE
  cp.course_id = $course_id
  AND cp.course_role = 'None'
  AND cip.max_course_instance_role IS NULL
FOR NO KEY UPDATE OF
  cp;

-- BLOCK insert_course_instance_permissions
WITH
  existing_course_permission AS (
    SELECT
      cp.*
    FROM
      course_permissions AS cp
    WHERE
      cp.user_id = $user_id
      AND cp.course_id = $course_id
  ),
  inserted_course_instance_permissions AS (
    INSERT INTO
      course_instance_permissions AS cip (
        course_instance_id,
        course_instance_role,
        course_permission_id
      )
    SELECT
      ci.id,
      $course_instance_role,
      cp.id
    FROM
      existing_course_permission AS cp
      -- Course instance ID is provided by the user, so must be validated against the course ID.
      JOIN course_instances AS ci ON (ci.course_id = cp.course_id)
    WHERE
      ci.id = $course_instance_id
    ON CONFLICT (course_instance_id, course_permission_id) DO
    UPDATE
    SET
      course_instance_role = EXCLUDED.course_instance_role
    WHERE
      cip.course_instance_role < EXCLUDED.course_instance_role
    RETURNING
      cip.*
  ),
  inserted_audit_log AS (
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
      'course_instance_permissions',
      cip.id,
      'insert',
      to_jsonb(cip)
    FROM
      inserted_course_instance_permissions AS cip
      JOIN existing_course_permission AS cp ON TRUE
  )
SELECT
  *
FROM
  existing_course_permission;

-- BLOCK update_course_instance_permissions_role
WITH
  updated_course_instance_permissions AS (
    UPDATE course_instance_permissions AS cip
    SET
      course_instance_role = $course_instance_role
    FROM
      course_permissions AS cp
    WHERE
      cip.course_permission_id = cp.id
      AND cp.user_id = $user_id
      AND cp.course_id = $course_id
      AND cip.course_instance_id = $course_instance_id
    RETURNING
      cip.*
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
      $course_id,
      $user_id,
      'course_instance_permissions',
      'course_instance_role',
      cip.id,
      'update',
      jsonb_build_object('course_instance_role', $course_instance_role),
      to_jsonb(cip)
    FROM
      updated_course_instance_permissions AS cip
  )
SELECT
  *
FROM
  updated_course_instance_permissions;

-- BLOCK delete_course_instance_permissions
WITH
  deleted_course_instance_permissions AS (
    DELETE FROM course_instance_permissions AS cip USING course_permissions AS cp
    WHERE
      cip.course_permission_id = cp.id
      AND cp.user_id = $user_id
      AND cp.course_id = $course_id
      AND cip.course_instance_id = $course_instance_id
    RETURNING
      cip.*
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    course_id,
    user_id,
    table_name,
    row_id,
    action,
    old_state
  )
SELECT
  $authn_user_id,
  $course_id,
  $user_id,
  'course_instance_permissions',
  cip.id,
  'delete',
  to_jsonb(cip)
FROM
  deleted_course_instance_permissions AS cip;

-- BLOCK delete_all_course_instance_permissions_for_course
WITH
  deleted_course_instance_permissions AS (
    DELETE FROM course_instance_permissions AS cip USING course_permissions AS cp
    WHERE
      cip.course_permission_id = cp.id
      AND cp.course_id = $course_id
    RETURNING
      to_jsonb(cip) AS old_state,
      cip.id,
      cp.user_id
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    course_id,
    user_id,
    table_name,
    row_id,
    action,
    old_state
  )
SELECT
  $authn_user_id,
  $course_id,
  cip.user_id,
  'course_instance_permissions',
  cip.id,
  'delete',
  cip.old_state
FROM
  deleted_course_instance_permissions AS cip;
