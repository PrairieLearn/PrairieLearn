-- BLOCK insert_course_permissions
WITH
  inserted_course_permissions AS (
    INSERT INTO
      course_permissions AS cp (user_id, course_id, course_role)
    VALUES
      ($user_id, $course_id, $course_role)
    ON CONFLICT (user_id, course_id) DO UPDATE
    SET
      course_role = EXCLUDED.course_role
    WHERE
      -- This query will only step up in permission. If a permission already
      -- exists for this user and it has higher permissions than what we're
      -- trying to insert, this will be a no-op.
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
      ci.id AS course_instance_id,
      $course_instance_role,
      cp.id AS course_permission_id
    FROM
      existing_course_permission AS cp
      -- Course instance ID is provided by the user, so must be validated against the course ID.
      JOIN course_instances AS ci ON (ci.course_id = cp.course_id)
    WHERE
      ci.id = $course_instance_id
    ON CONFLICT (course_instance_id, course_permission_id) DO UPDATE
    SET
      course_instance_role = EXCLUDED.course_instance_role
    WHERE
      -- This query will only step up in permission. If a permission already
      -- exists for this user and it has higher permissions than what we're
      -- trying to insert, this will be a no-op.
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

-- BLOCK upsert_course_instance_permissions_role
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
  upserted_course_instance_permissions AS (
    INSERT INTO
      course_instance_permissions AS cip (
        course_instance_id,
        course_instance_role,
        course_permission_id
      )
    SELECT
      ci.id AS course_instance_id,
      $course_instance_role,
      cp.id AS course_permission_id
    FROM
      existing_course_permission AS cp
      JOIN course_instances AS ci ON (ci.course_id = cp.course_id)
    WHERE
      ci.id = $course_instance_id
    ON CONFLICT (course_instance_id, course_permission_id) DO UPDATE
    SET
      course_instance_role = EXCLUDED.course_instance_role
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
      cp.course_id,
      cp.user_id,
      'course_instance_permissions',
      'course_instance_role',
      cip.id,
      'upsert',
      jsonb_build_object('course_instance_role', $course_instance_role),
      to_jsonb(cip)
    FROM
      upserted_course_instance_permissions AS cip
      JOIN existing_course_permission AS cp ON TRUE
  )
SELECT
  *
FROM
  upserted_course_instance_permissions;

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

-- BLOCK select_course_instance_permission_for_user
SELECT
  cip.course_instance_role
FROM
  course_instance_permissions AS cip
  JOIN course_permissions AS cp ON cip.course_permission_id = cp.id
WHERE
  cip.course_instance_id = $course_instance_id
  AND cp.user_id = $user_id;

-- BLOCK select_course_permission_for_user
SELECT
  cp.course_role
FROM
  course_permissions AS cp
WHERE
  cp.course_id = $course_id
  AND cp.user_id = $user_id;

-- BLOCK select_course_users
SELECT
  to_jsonb(u) AS user,
  to_jsonb(cp) AS course_permission,
  jsonb_agg(
    jsonb_build_object(
      'id',
      ci.id,
      'short_name',
      ci.short_name,
      'course_instance_permission_id',
      cip.id,
      'course_instance_role',
      cip.course_instance_role,
      'course_instance_role_formatted',
      CASE
        WHEN cip.course_instance_role = 'Student Data Viewer'::enum_course_instance_role THEN 'Viewer'
        WHEN cip.course_instance_role = 'Student Data Editor'::enum_course_instance_role THEN 'Editor'
      END
    )
    ORDER BY
      d.start_date DESC NULLS LAST,
      d.end_date DESC NULLS LAST,
      ci.id DESC
  ) FILTER (
    WHERE
      cip.course_instance_role IS NOT NULL
  ) AS course_instance_roles
FROM
  course_permissions AS cp
  JOIN users AS u ON (u.id = cp.user_id)
  FULL JOIN course_instances AS ci ON (
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL
  )
  LEFT JOIN course_instance_permissions AS cip ON (
    cip.course_permission_id = cp.id
    AND ci.id = cip.course_instance_id
  ),
  LATERAL (
    SELECT
      COALESCE(ci.publishing_start_date, min(ar.start_date)) AS start_date,
      COALESCE(ci.publishing_end_date, max(ar.end_date)) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
WHERE
  cp.course_id = $course_id
GROUP BY
  u.*,
  u.uid,
  u.name,
  u.id,
  cp.*
ORDER BY
  u.uid,
  u.name,
  u.id;

-- BLOCK user_is_instructor_in_any_course
SELECT
  TRUE
FROM
  users AS u
  LEFT JOIN administrators AS adm ON (adm.user_id = u.id)
  LEFT JOIN course_permissions AS cp ON (cp.user_id = u.id)
  LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
  LEFT JOIN courses AS c ON (c.id = cp.course_id)
  LEFT JOIN course_instances AS ci ON (
    ci.id = cip.course_instance_id
    AND ci.course_id = c.id
  )
WHERE
  u.id = $user_id
  AND (
    adm.id IS NOT NULL
    OR (
      (
        cp.course_role > 'None'
        OR cip.course_instance_role > 'None'
      )
      AND c.deleted_at IS NULL
      AND ci.deleted_at IS NULL
    )
  )
LIMIT
  1;
