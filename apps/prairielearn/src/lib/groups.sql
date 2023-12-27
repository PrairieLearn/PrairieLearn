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
      group_users AS gu (user_id, group_id)
    SELECT
      $user_id,
      cg.id
    FROM
      create_group AS cg
    RETURNING
      gu.*
  ),
  assign_role AS (
    INSERT INTO
      group_user_roles (group_user_id, user_id, group_id, group_role_id)
    SELECT
      jg.id,
      jg.user_id,
      jg.group_id,
      gr.role_id
    FROM
      join_group AS jg,
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
  ),
  count_group_user_per_role AS (
    SELECT
      gur.group_role_id,
      COUNT(gur.id) AS count
    FROM
      group_user_roles AS gur
    WHERE
      gur.group_id = $group_id
    GROUP BY
      gur.group_role_id
  )
SELECT
  gr.id,
  gr.role_name,
  COALESCE(gur.count, 0) AS count,
  gr.maximum,
  gr.minimum,
  gr.can_assign_roles_at_start,
  gr.can_assign_roles_during_assessment
FROM
  get_assessment_id
  JOIN group_roles AS gr ON (
    gr.assessment_id = get_assessment_id.assessment_id
  )
  LEFT JOIN count_group_user_per_role AS gur ON gur.group_role_id = gr.id
ORDER BY
  minimum DESC;

-- BLOCK get_assessment_level_permissions
SELECT
  bool_or(gr.can_assign_roles_at_start) AS can_assign_roles_at_start,
  bool_or(gr.can_assign_roles_during_assessment) AS can_assign_roles_during_assessment
FROM
  group_roles as gr
  JOIN group_user_roles as gur ON (gr.id = gur.group_role_id)
WHERE
  gr.assessment_id = $assessment_id
  -- TODO probably a good idea to add a join with groups before doing this check?
  AND gur.user_id = $user_id;

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
  AND gu.user_id = $user_id
  AND g.deleted_at IS NULL;

-- BLOCK delete_non_required_roles
DELETE FROM group_user_roles gur USING group_roles AS gr
WHERE
  gur.group_id = $group_id
  AND gur.group_role_id = gr.id
  AND gr.assessment_id = $assessment_id
  AND gr.minimum = 0;

-- BLOCK delete_group_users
WITH
  deleted_group_users AS (
    DELETE FROM group_users
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
  json_roles AS (
    SELECT
      gu.id AS group_user_id,
      gu.user_id,
      gu.group_id,
      (role_assignment ->> 'group_role_id')::bigint AS group_role_id
    FROM
      JSON_ARRAY_ELEMENTS($role_assignments::json) AS role_assignment
      JOIN group_users AS gu ON gu.group_id = $group_id
      AND gu.user_id = (role_assignment ->> 'user_id')::bigint
  ),
  deleted_group_users_roles AS (
    DELETE FROM group_user_roles AS gur
    WHERE
      gur.group_id = $group_id
      AND NOT EXISTS (
        SELECT
          1
        FROM
          json_roles AS jr
        WHERE
          jr.user_id = gur.user_id
          AND jr.group_role_id = gur.group_role_id
      )
  )
INSERT INTO
  group_user_roles (group_user_id, group_id, user_id, group_role_id)
SELECT
  group_user_id,
  group_id,
  user_id,
  group_role_id
FROM
  json_roles
ON CONFLICT DO NOTHING;

-- BLOCK update_group_roles
WITH
  json_roles AS (
    SELECT
      gu.id AS group_user_id,
      gu.user_id,
      gu.group_id,
      (role_assignment ->> 'group_role_id')::bigint AS group_role_id
    FROM
      JSON_ARRAY_ELEMENTS($role_assignments::json) AS role_assignment
      JOIN group_users AS gu ON gu.group_id = $group_id
      AND gu.user_id = (role_assignment ->> 'user_id')::bigint
  ),
  assign_new_group_roles AS (
    INSERT INTO
      group_user_roles (group_user_id, group_id, user_id, group_role_id)
    SELECT
      jr.group_user_id,
      jr.group_id,
      jr.user_id,
      jr.group_role_id
    FROM
      json_roles jr
    ON CONFLICT DO NOTHING
  ),
  deleted_group_users_roles AS (
    DELETE FROM group_user_roles AS gur
    WHERE
      gur.group_id = $group_id
      AND NOT EXISTS (
        SELECT
          1
        FROM
          json_roles jr
        WHERE
          gur.user_id = jr.user_id
          AND gur.group_role_id = jr.group_role_id
      )
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
