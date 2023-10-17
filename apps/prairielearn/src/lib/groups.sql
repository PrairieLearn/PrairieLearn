-- BLOCK get_group_config
SELECT
  gc.*
FROM
  group_configs AS gc
WHERE
  gc.assessment_id = $assessment_id
  AND gc.deleted_at IS NULL;

-- BLOCK create_group
WITH
  create_group AS (
    INSERT INTO
      groups (name, group_config_id, course_instance_id) (
        SELECT
          $group_name,
          gc.id,
          gc.course_instance_id
        FROM
          group_configs AS gc
        WHERE
          gc.assessment_id = $assessment_id
          AND gc.deleted_at IS NULL
      )
    RETURNING
      id
  ),
  create_log AS (
    INSERT INTO
      group_logs (authn_user_id, user_id, group_id, action)
    SELECT
      $authn_user_id,
      $user_id,
      cg.id,
      'create'
    FROM
      create_group AS cg
  ),
  get_role AS (
    SELECT
      gr.id AS role_id
    FROM
      group_roles AS gr
    WHERE
      (
        gr.assessment_id = $assessment_id
        AND gr.can_assign_roles_at_start
      )
    ORDER BY
      gr.maximum
    LIMIT
      1
  ),
  join_group AS (
    INSERT INTO
      group_users (user_id, group_id)
    SELECT
      $user_id,
      cg.id
    FROM
      create_group AS cg
  ),
  assign_role AS (
    INSERT INTO
      group_user_roles (user_id, group_role_id, group_id)
    SELECT
      $user_id,
      gr.role_id,
      cg.id
    FROM
      create_group AS cg,
      get_role as gr
  )
INSERT INTO
  group_logs (authn_user_id, user_id, group_id, action)
SELECT
  $authn_user_id,
  $user_id,
  cg.id,
  'join'
FROM
  create_group AS cg;

-- BLOCK get_group_members
SELECT DISTINCT
  u.uid,
  u.user_id,
  g.name AS group_name,
  g.join_code
FROM
  group_users AS gu
  JOIN users as u ON u.user_id = gu.user_id
  JOIN groups as g ON gu.group_id = g.id
WHERE
  g.id = $group_id;

-- BLOCK get_group_roles
WITH
  get_assessment_id AS (
    SELECT
      gc.assessment_id
    FROM
      group_configs AS gc
      JOIN groups AS g ON g.group_config_id = gc.id
    WHERE
      g.id = $group_id
  )
SELECT
  gr.id,
  gr.role_name,
  COUNT(gur.user_id) AS count,
  gr.maximum,
  gr.minimum,
  gr.can_assign_roles_at_start,
  gr.can_assign_roles_during_assessment
FROM
  get_assessment_id
  JOIN group_roles AS gr ON (
    gr.assessment_id = get_assessment_id.assessment_id
  )
  LEFT JOIN (
    SELECT
      *
    FROM
      group_user_roles
    WHERE
      group_id = $group_id
  ) AS gur ON gur.group_role_id = gr.id
GROUP BY
  gr.id,
  gr.role_name,
  maximum,
  minimum,
  can_assign_roles_at_start,
  can_assign_roles_during_assessment
ORDER BY
  minimum DESC;

-- BLOCK get_assessment_level_permissions
SELECT
  bool_or(gr.can_assign_roles_at_start) AS can_assign_roles_at_start,
  bool_or(gr.can_assign_roles_during_assessment) AS can_assign_roles_during_assessment
FROM
  group_roles as gr
  JOIN group_user_roles as gu ON gr.id = gu.group_role_id
WHERE
  gr.assessment_id = $assessment_id
  AND gu.user_id = $user_id;

-- BLOCK get_role_assignments
SELECT
  gu.user_id,
  u.uid,
  gr.role_name,
  gr.id as group_role_id
FROM
  users u
  JOIN group_user_roles gu ON u.user_id = gu.user_id
  JOIN group_roles gr ON gu.group_role_id = gr.id
WHERE
  gu.group_id = $group_id;

-- BLOCK get_group_id
SELECT
  g.id
FROM
  groups as g
  JOIN group_configs AS gc ON g.group_config_id = gc.id
  JOIN group_users AS gu ON gu.group_id = g.id
WHERE
  gc.assessment_id = $assessment_id
  AND gu.user_id = $user_id;

-- BLOCK delete_non_required_roles
DELETE FROM group_user_roles gur
WHERE
  group_id = $group_id
  AND group_role_id IN (
    SELECT
      id
    FROM
      group_roles
    WHERE
      assessment_id = $assessment_id
      AND minimum = 0
  );

-- BLOCK delete_group_users
WITH
  deleted_group_users AS (
    DELETE FROM group_users
    WHERE
      user_id = $user_id
      AND group_id = $group_id
  ),
  deleted_group_user_roles AS (
    DELETE FROM group_user_roles
    WHERE
      user_id = $user_id
      AND group_id = $group_id
  )
INSERT INTO
  group_logs (authn_user_id, user_id, group_id, action)
VALUES
  ($authn_user_id, $user_id, $group_id, 'leave');

-- BLOCK reassign_group_roles_after_leave
WITH
  deleted_group_users_roles AS (
    DELETE FROM group_user_roles
    WHERE
      group_id = $group_id
  ),
  json_roles AS (
    SELECT
      (role_assignment ->> 'user_id')::bigint AS user_id,
      (role_assignment ->> 'group_role_id')::bigint AS group_role_id
    FROM
      JSON_ARRAY_ELEMENTS($role_assignments::json) AS role_assignment
  )
INSERT INTO
  group_user_roles (group_id, user_id, group_role_id)
SELECT
  $group_id AS group_id,
  user_id,
  group_role_id
FROM
  json_roles
ON CONFLICT (group_id, user_id, group_role_id) DO
UPDATE
SET
  group_role_id = EXCLUDED.group_role_id;

-- BLOCK update_group_roles
WITH
  deleted_group_users_roles AS (
    DELETE FROM group_user_roles
    WHERE
      group_id = $group_id
  ),
  assign_new_group_roles AS (
    INSERT INTO
      group_user_roles (group_id, user_id, group_role_id)
    SELECT
      (role_assignment ->> 'group_id')::bigint,
      (role_assignment ->> 'user_id')::bigint,
      (role_assignment ->> 'group_role_id')::bigint
    FROM
      JSON_ARRAY_ELEMENTS($role_assignments::json) as role_assignment
    ON CONFLICT (group_id, user_id, group_role_id) DO
    UPDATE
    SET
      group_role_id = EXCLUDED.group_role_id
  )
INSERT INTO
  group_logs (authn_user_id, user_id, group_id, action)
VALUES
  (
    $authn_user_id,
    $user_id,
    $group_id,
    'update roles'
  );

-- BLOCK delete_all_groups
WITH
  assessment_groups AS (
    SELECT
      g.id
    FROM
      group_configs AS gc
      JOIN groups AS g ON (g.group_config_id = gc.id)
    WHERE
      gc.assessment_id = $assessment_id
      AND g.deleted_at IS NULL
      AND gc.deleted_at IS NULL
  ),
  deleted_group_users AS (
    DELETE FROM group_users
    WHERE
      group_id IN (
        SELECT
          id
        FROM
          assessment_groups
      )
    RETURNING
      user_id,
      group_id
  ),
  deleted_group_users_logs AS (
    INSERT INTO
      group_logs (authn_user_id, user_id, group_id, action)
    SELECT
      $authn_user_id,
      user_id,
      group_id,
      'leave'
    FROM
      deleted_group_users
  ),
  deleted_groups AS (
    UPDATE groups AS g
    SET
      deleted_at = NOW()
    FROM
      assessment_groups AS ag
    WHERE
      g.id = ag.id
    RETURNING
      g.id
  )
INSERT INTO
  group_logs (authn_user_id, group_id, action)
SELECT
  $authn_user_id,
  id,
  'delete'
FROM
  deleted_groups;
