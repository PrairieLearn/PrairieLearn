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
  gr.minimum
FROM
  (
    SELECT
      *
    FROM
      group_roles
    WHERE
      assessment_id = (
        SELECT
          *
        FROM
          get_assessment_id
      )
  ) AS gr
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
  maximum,
  minimum,
  role_name;

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
  gr.role_name
FROM
  users u
  JOIN group_user_roles gu ON u.user_id = gu.user_id
  JOIN group_roles gr ON gu.group_role_id = gr.id
WHERE
  gu.group_id = $group_id;

-- BLOCK get_user_with_non_required_role
SELECT
  gu.user_id,
  gr.id AS group_role_id
FROM
  users u
  JOIN group_user_roles gu ON u.user_id = gu.user_id
  JOIN group_roles gr ON gu.group_role_id = gr.id
WHERE
  gu.group_id = $group_id
  AND u.user_id != $user_id
  AND gr.minimum = 0
LIMIT
  1;

-- BLOCK update_group_user_role
WITH
  updated_group_role AS (
    UPDATE group_user_roles
    SET
      group_role_id = $group_role_id
    WHERE
      group_id = $group_id
      AND user_id = $assignee_id
      AND group_role_id = $assignee_old_role_id
  )
SELECT
  1;

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

-- BLOCK get_user_roles
SELECT
  gu.group_role_id
FROM
  group_user_roles as gu
WHERE
  gu.group_id = $group_id
  AND gu.user_id = $user_id;

-- BLOCK get_user_required_roles
SELECT
  gu.group_role_id
FROM
  group_user_roles gu
  JOIN group_roles gr ON gu.group_role_id = gr.id
WHERE
  gu.group_id = $group_id
  AND gu.user_id = $user_id
  AND gr.minimum > 0;

-- BLOCK assign_user_roles
WITH
  assign_user_role AS (
    INSERT INTO
      group_user_roles (group_id, user_id, group_role_id)
    VALUES
      ($group_id, $assignee_id, $group_role_id)
    ON CONFLICT (group_id, user_id, group_role_id) DO NOTHING
  )
SELECT
  1;

-- BLOCK delete_non_required_roles
WITH
  deleted_group_user_roles AS (
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
      )
  )
SELECT
  1;

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
  ),
  create_log AS (
    INSERT INTO
      group_logs (authn_user_id, user_id, group_id, action)
    VALUES
      ($authn_user_id, $user_id, $group_id, 'leave')
  )
SELECT
  1;

-- BLOCK transfer_group_roles
WITH
  group_role_ids AS (
    SELECT
      gu.group_role_id
    FROM
      group_user_roles gu
    WHERE
      gu.group_id = $group_id
      AND gu.user_id = $user_id
  ),
  transferred_group_roles AS (
    INSERT INTO
      group_user_roles (group_id, user_id, group_role_id)
    SELECT
      $group_id,
      $assignee_user_id,
      gri.group_role_id
    FROM
      group_role_ids AS gri
    ON CONFLICT (group_id, user_id, group_role_id) DO NOTHING
  )
SELECT
  1;
