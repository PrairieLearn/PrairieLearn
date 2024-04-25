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
      id,
      group_config_id
  )
INSERT INTO
  group_logs (authn_user_id, group_id, action)
SELECT
  $authn_user_id,
  cg.id,
  'create'
FROM
  create_group AS cg
RETURNING
  group_id;

-- BLOCK select_group
SELECT
  *
FROM
  groups
WHERE
  id = $group_id;

-- BLOCK select_group_members
SELECT
  u.*
FROM
  group_users AS gu
  JOIN users as u ON (u.user_id = gu.user_id)
WHERE
  gu.group_id = $group_id;

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
  gr.*,
  COALESCE(gur.count, 0)::INT AS count
FROM
  get_assessment_id
  JOIN group_roles AS gr ON (
    gr.assessment_id = get_assessment_id.assessment_id
  )
  LEFT JOIN count_group_user_per_role AS gur ON gur.group_role_id = gr.id
ORDER BY
  minimum DESC;

-- BLOCK select_question_permissions
SELECT
  COALESCE(BOOL_OR(aqrp.can_view), FALSE) AS can_view,
  COALESCE(BOOL_OR(aqrp.can_submit), FALSE) AS can_submit
FROM
  instance_questions AS iq
  JOIN assessment_question_role_permissions AS aqrp ON (
    aqrp.assessment_question_id = iq.assessment_question_id
  )
  JOIN group_user_roles AS gur ON gur.group_role_id = aqrp.group_role_id
WHERE
  iq.id = $instance_question_id
  AND gur.group_id = $group_id
  AND gur.user_id = $user_id;

-- BLOCK get_role_assignments
SELECT
  gu.user_id,
  u.uid,
  gr.role_name,
  gr.id as group_role_id
FROM
  group_users AS gu
  JOIN users u ON (gu.user_id = u.user_id)
  JOIN group_user_roles gur ON (
    gu.group_id = gur.group_id
    AND gu.user_id = gur.user_id
  )
  JOIN group_roles gr ON (gur.group_role_id = gr.id)
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

-- BLOCK select_and_lock_group_by_name
SELECT
  g.*
FROM
  groups AS g
  JOIN group_configs AS gc ON g.group_config_id = gc.id
WHERE
  g.name = $group_name
  AND gc.assessment_id = $assessment_id
  AND g.deleted_at IS NULL
  AND gc.deleted_at IS NULL
FOR NO KEY UPDATE of
  g;

-- BLOCK select_and_lock_group
SELECT
  g.*,
  (
    SELECT
      COUNT(*)
    FROM
      group_users AS gu
    WHERE
      gu.group_id = g.id
  )::INT AS cur_size,
  gc.maximum AS max_size,
  gc.has_roles
FROM
  groups AS g
  JOIN group_configs AS gc ON g.group_config_id = gc.id
WHERE
  g.id = $group_id
  AND gc.assessment_id = $assessment_id
  AND g.deleted_at IS NULL
  AND gc.deleted_at IS NULL
FOR NO KEY UPDATE of
  g;

-- BLOCK select_suitable_group_role
WITH
  users_per_group_role AS (
    SELECT
      gur.group_role_id,
      COUNT(*) AS user_count
    FROM
      group_user_roles AS gur
    WHERE
      gur.group_id = $group_id
    GROUP BY
      gur.group_role_id
  ),
  suitable_group_roles AS (
    SELECT
      gr.id,
      (
        gr.can_assign_roles
        AND COALESCE($cur_size::INT, 0) = 0
      ) AS assigner_role_needed,
      (
        upgr.user_count IS NULL
        AND gr.minimum > 0
      ) AS mandatory_with_no_user,
      GREATEST(0, gr.minimum - COALESCE(upgr.user_count, 0)) AS needed_users,
      (gr.maximum - COALESCE(upgr.user_count, 0)) AS remaining
    FROM
      group_roles AS gr
      LEFT JOIN users_per_group_role AS upgr ON (upgr.group_role_id = gr.id)
    WHERE
      gr.assessment_id = $assessment_id
      AND (
        gr.maximum IS NULL
        OR gr.maximum > COALESCE(upgr.user_count, 0)
      )
  )
SELECT
  sgr.id
FROM
  suitable_group_roles AS sgr
ORDER BY
  -- If there are no users in the group, assign to an assigner role.
  assigner_role_needed DESC,
  -- Assign to a mandatory role with no users, if one exists.
  mandatory_with_no_user DESC,
  -- Assign to role that has not reached their minimum.
  needed_users DESC,
  -- Assign to role that has the most remaining spots.
  remaining DESC NULLS LAST
LIMIT
  1;

-- BLOCK insert_group_user
WITH
  inserted_user AS (
    INSERT INTO
      group_users (group_id, user_id, group_config_id)
    VALUES
      ($group_id, $user_id, $group_config_id)
    RETURNING
      *
  ),
  inserted_user_roles AS (
    INSERT INTO
      group_user_roles (user_id, group_id, group_role_id)
    SELECT
      iu.user_id,
      iu.group_id,
      $group_role_id
    FROM
      inserted_user AS iu
    WHERE
      $group_role_id::bigint IS NOT NULL
    RETURNING
      *
  )
INSERT INTO
  group_logs (authn_user_id, user_id, group_id, action, roles)
SELECT
  $authn_user_id,
  iu.user_id,
  iu.group_id,
  'join',
  CASE
    WHEN gr.id IS NOT NULL THEN ARRAY[gr.role_name]
  END
FROM
  inserted_user AS iu
  LEFT JOIN inserted_user_roles AS ur ON TRUE
  LEFT JOIN group_roles AS gr ON ur.group_role_id = gr.id;

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

-- BLOCK update_group_roles
WITH
  json_roles AS (
    SELECT
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
      group_user_roles (group_id, user_id, group_role_id)
    SELECT
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
  group_logs (authn_user_id, user_id, group_id, action, roles)
SELECT
  $authn_user_id,
  gu.user_id,
  $group_id,
  'update roles',
  COALESCE(
    array_agg(gr.role_name) FILTER (
      WHERE
        gr.id IS NOT NULL
    ),
    array[]::text[]
  )
FROM
  group_users AS gu
  LEFT JOIN json_roles AS jr on jr.user_id = gu.user_id
  LEFT JOIN group_roles AS gr ON jr.group_role_id = gr.id
WHERE
  gu.group_id = $group_id
GROUP BY
  gu.user_id;

-- BLOCK delete_group
WITH
  group_to_delete AS (
    SELECT
      g.id
    FROM
      groups AS g
      JOIN group_configs AS gc ON (g.group_config_id = gc.id)
    WHERE
      gc.assessment_id = $assessment_id
      AND g.id = $group_id
      AND g.deleted_at IS NULL
      AND gc.deleted_at IS NULL
    FOR NO KEY UPDATE OF
      g
  ),
  deleted_group_users AS (
    DELETE FROM group_users AS gu
    WHERE
      gu.group_id IN (
        SELECT
          gd.id
        FROM
          group_to_delete AS gd
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
  deleted_group AS (
    UPDATE groups AS g
    SET
      deleted_at = NOW()
    FROM
      group_to_delete AS gd
    WHERE
      gd.id = g.id
    RETURNING
      g.id
  ),
  deleted_group_log AS (
    INSERT INTO
      group_logs (authn_user_id, group_id, action)
    SELECT
      $authn_user_id,
      id,
      'delete'
    FROM
      deleted_group
  )
SELECT
  id
FROM
  deleted_group;

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
