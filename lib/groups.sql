-- BLOCK get_config_info
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
      (
        SELECT
          *
        FROM
          get_role
      ) as gr
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
  gu.group_id,
  g.name AS group_name,
  g.join_code
FROM
  assessments AS a
  JOIN group_configs AS gc ON gc.assessment_id = a.id
  JOIN groups AS g ON g.group_config_id = gc.id
  JOIN group_users AS gu ON gu.group_id = g.id
  JOIN group_users AS gu2 ON gu2.group_id = gu.group_id
  JOIN users AS u ON u.user_id = gu2.user_id
WHERE
  a.id = $assessment_id
  AND gu.user_id = $user_id
  AND g.deleted_at IS NULL
  AND gc.deleted_at IS NULL
  -- BLOCK get_group_roles
SELECT
  gr.id::INTEGER,
  gr.role_name,
  COUNT(gu.user_id)::INTEGER AS count,
  gr.maximum,
  gr.minimum
FROM
  (
    SELECT
      *
    FROM
      group_roles
    WHERE
      assessment_id = $assessment_id
  ) AS gr
  LEFT JOIN (
    SELECT
      *
    FROM
      group_user_roles
    WHERE
      group_id = $group_id
  ) AS gu ON gu.group_role_id = gr.id
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
