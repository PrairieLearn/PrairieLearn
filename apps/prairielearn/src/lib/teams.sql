-- BLOCK get_team_config
SELECT
  tc.*
FROM
  team_configs AS tc
WHERE
  tc.assessment_id = $assessment_id
  AND tc.deleted_at IS NULL;

-- BLOCK create_team
WITH
  next_team_number AS (
    SELECT
      SUBSTRING(
        t.name
        FROM
          6
      )::integer + 1 AS team_number
    FROM
      teams AS t
      JOIN team_configs AS tc ON (tc.id = t.team_config_id)
    WHERE
      tc.assessment_id = $assessment_id
      AND t.name ~ '^group[0-9]+$'
      AND t.deleted_at IS NULL
    ORDER BY
      team_number DESC
    LIMIT
      1
  ),
  create_team AS (
    INSERT INTO
      teams (name, team_config_id, course_instance_id) (
        SELECT
          COALESCE(
            NULLIF($team_name::text, ''),
            -- If no name is provided, use the next team number.
            (
              SELECT
                'group' || team_number
              FROM
                next_team_number
            ),
            -- If no name is provided and no teams exist, use 'group1'.
            'group1'
          ),
          tc.id,
          tc.course_instance_id
        FROM
          team_configs AS tc
        WHERE
          tc.assessment_id = $assessment_id
          AND tc.deleted_at IS NULL
      )
    RETURNING
      *
  ),
  log_team AS (
    INSERT INTO
      team_logs (authn_user_id, team_id, action)
    SELECT
      $authn_user_id,
      ct.id,
      'create'
    FROM
      create_team AS ct
  )
SELECT
  *
FROM
  create_team;

-- BLOCK select_team
SELECT
  *
FROM
  teams
WHERE
  id = $team_id;

-- BLOCK select_team_members
SELECT
  u.*
FROM
  team_users AS tu
  JOIN users AS u ON (u.id = tu.user_id)
WHERE
  tu.team_id = $team_id;

-- BLOCK get_team_roles
WITH
  get_assessment_id AS (
    SELECT
      tc.assessment_id
    FROM
      team_configs AS tc
      JOIN teams AS t ON t.team_config_id = tc.id
    WHERE
      t.id = $team_id
  ),
  count_team_user_per_role AS (
    SELECT
      tur.team_role_id,
      COUNT(tur.id) AS count
    FROM
      team_user_roles AS tur
    WHERE
      tur.team_id = $team_id
    GROUP BY
      tur.team_role_id
  )
SELECT
  tr.*,
  COALESCE(tur.count, 0)::int AS count
FROM
  get_assessment_id
  JOIN team_roles AS tr ON (
    tr.assessment_id = get_assessment_id.assessment_id
  )
  LEFT JOIN count_team_user_per_role AS tur ON tur.team_role_id = tr.id
ORDER BY
  minimum DESC;

-- BLOCK select_user_roles
SELECT
  tr.*
FROM
  team_roles AS tr
  JOIN team_user_roles AS tur ON tur.team_role_id = tr.id
WHERE
  tur.user_id = $user_id
  AND tur.team_id = $team_id;

-- BLOCK select_question_permissions
SELECT
  COALESCE(BOOL_OR(aqrp.can_view), FALSE) AS can_view,
  COALESCE(BOOL_OR(aqrp.can_submit), FALSE) AS can_submit
FROM
  instance_questions AS iq
  JOIN assessment_question_role_permissions AS aqrp ON (
    aqrp.assessment_question_id = iq.assessment_question_id
  )
  JOIN team_user_roles AS tur ON tur.team_role_id = aqrp.team_role_id
WHERE
  iq.id = $instance_question_id
  AND tur.team_id = $team_id
  AND tur.user_id = $user_id;

-- BLOCK get_role_assignments
SELECT
  tu.user_id,
  u.uid,
  tr.role_name,
  tr.id AS team_role_id
FROM
  team_users AS tu
  JOIN users u ON (tu.user_id = u.id)
  JOIN team_user_roles AS tur ON (
    tu.team_id = tur.team_id
    AND tu.user_id = tur.user_id
  )
  JOIN team_roles AS tr ON (tur.team_role_id = tr.id)
WHERE
  tu.team_id = $team_id;

-- BLOCK get_team_id
SELECT
  t.id
FROM
  teams AS t
  JOIN team_configs AS tc ON t.team_config_id = tc.id
  JOIN team_users AS tu ON tu.team_id = t.id
WHERE
  tc.assessment_id = $assessment_id
  AND tu.user_id = $user_id
  AND t.deleted_at IS NULL;

-- BLOCK select_and_lock_team_by_name
SELECT
  t.*
FROM
  teams AS t
  JOIN team_configs AS tc ON t.team_config_id = tc.id
WHERE
  t.name = $team_name
  AND tc.assessment_id = $assessment_id
  AND t.deleted_at IS NULL
  AND tc.deleted_at IS NULL
FOR NO KEY UPDATE OF
  t;

-- BLOCK select_and_lock_team
SELECT
  t.*,
  (
    SELECT
      COUNT(*)
    FROM
      team_users AS tu
    WHERE
      tu.team_id = t.id
  )::int AS cur_size,
  tc.maximum AS max_size,
  tc.has_roles
FROM
  teams AS t
  JOIN team_configs AS tc ON t.team_config_id = tc.id
WHERE
  t.id = $team_id
  AND tc.assessment_id = $assessment_id
  AND t.deleted_at IS NULL
  AND tc.deleted_at IS NULL
FOR NO KEY UPDATE OF
  t;

-- BLOCK select_suitable_team_role
WITH
  users_per_team_role AS (
    SELECT
      tur.team_role_id,
      COUNT(*) AS user_count
    FROM
      team_user_roles AS tur
    WHERE
      tur.team_id = $team_id
    GROUP BY
      tur.team_role_id
  ),
  suitable_team_roles AS (
    SELECT
      tr.id,
      (
        tr.can_assign_roles
        AND COALESCE($cur_size::int, 0) = 0
      ) AS assigner_role_needed,
      (
        uptr.user_count IS NULL
        AND tr.minimum > 0
      ) AS mandatory_with_no_user,
      GREATEST(0, tr.minimum - COALESCE(uptr.user_count, 0)) AS needed_users,
      (tr.maximum - COALESCE(uptr.user_count, 0)) AS remaining
    FROM
      team_roles AS tr
      LEFT JOIN users_per_team_role AS uptr ON (uptr.team_role_id = tr.id)
    WHERE
      tr.assessment_id = $assessment_id
      AND (
        tr.maximum IS NULL
        OR tr.maximum > COALESCE(uptr.user_count, 0)
      )
  )
SELECT
  str.id
FROM
  suitable_team_roles AS str
ORDER BY
  -- If there are no users in the team, assign to an assigner role.
  assigner_role_needed DESC,
  -- Assign to a mandatory role with no users, if one exists.
  mandatory_with_no_user DESC,
  -- Assign to role that has not reached their minimum.
  needed_users DESC,
  -- Assign to role that has the most remaining spots.
  remaining DESC NULLS LAST
LIMIT
  1;

-- BLOCK insert_team_user
WITH
  inserted_user AS (
    INSERT INTO
      team_users (team_id, user_id, team_config_id)
    VALUES
      ($team_id, $user_id, $team_config_id)
    RETURNING
      *
  ),
  inserted_user_roles AS (
    INSERT INTO
      team_user_roles (user_id, team_id, team_role_id)
    SELECT
      iu.user_id,
      iu.team_id,
      $team_role_id
    FROM
      inserted_user AS iu
    WHERE
      $team_role_id::bigint IS NOT NULL
    RETURNING
      *
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      modified_at = NOW()
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.team_id = $team_id
  )
INSERT INTO
  team_logs (authn_user_id, user_id, team_id, action, roles)
SELECT
  $authn_user_id,
  iu.user_id,
  iu.team_id,
  'join',
  CASE
    WHEN tr.id IS NOT NULL THEN ARRAY[tr.role_name]
  END
FROM
  inserted_user AS iu
  LEFT JOIN inserted_user_roles AS ur ON TRUE
  LEFT JOIN team_roles AS tr ON ur.team_role_id = tr.id;

-- BLOCK delete_non_required_roles
DELETE FROM team_user_roles AS tur USING team_roles AS tr
WHERE
  tur.team_id = $team_id
  AND tur.team_role_id = tr.id
  AND tr.assessment_id = $assessment_id
  AND tr.minimum = 0;

-- BLOCK delete_team_users
WITH
  deleted_team_users AS (
    DELETE FROM team_users
    WHERE
      user_id = $user_id
      AND team_id = $team_id
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      modified_at = NOW()
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.team_id = $team_id
  )
INSERT INTO
  team_logs (authn_user_id, user_id, team_id, action)
VALUES
  ($authn_user_id, $user_id, $team_id, 'leave');

-- BLOCK update_team_roles
WITH
  json_roles AS (
    SELECT
      tu.user_id,
      tu.team_id,
      (role_assignment ->> 'team_role_id')::bigint AS team_role_id
    FROM
      JSON_ARRAY_ELEMENTS($role_assignments::json) AS role_assignment
      JOIN team_users AS tu ON tu.team_id = $team_id
      AND tu.user_id = (role_assignment ->> 'user_id')::bigint
  ),
  assign_new_team_roles AS (
    INSERT INTO
      team_user_roles (team_id, user_id, team_role_id)
    SELECT
      jr.team_id,
      jr.user_id,
      jr.team_role_id
    FROM
      json_roles jr
    ON CONFLICT DO NOTHING
  ),
  deleted_team_users_roles AS (
    DELETE FROM team_user_roles AS tur
    WHERE
      tur.team_id = $team_id
      AND NOT EXISTS (
        SELECT
          1
        FROM
          json_roles jr
        WHERE
          tur.user_id = jr.user_id
          AND tur.team_role_id = jr.team_role_id
      )
  )
INSERT INTO
  team_logs (authn_user_id, user_id, team_id, action, roles)
SELECT
  $authn_user_id,
  tu.user_id,
  $team_id,
  'update roles',
  COALESCE(
    array_agg(tr.role_name) FILTER (
      WHERE
        tr.id IS NOT NULL
    ),
    ARRAY[]::text[]
  )
FROM
  team_users AS tu
  LEFT JOIN json_roles AS jr ON jr.user_id = tu.user_id
  LEFT JOIN team_roles AS tr ON jr.team_role_id = tr.id
WHERE
  tu.team_id = $team_id
GROUP BY
  tu.user_id;

-- BLOCK delete_team
WITH
  team_to_delete AS (
    SELECT
      t.id
    FROM
      teams AS t
      JOIN team_configs AS tc ON (t.team_config_id = tc.id)
    WHERE
      tc.assessment_id = $assessment_id
      AND t.id = $team_id
      AND t.deleted_at IS NULL
      AND tc.deleted_at IS NULL
    FOR NO KEY UPDATE OF
      t
  ),
  deleted_team_users AS (
    DELETE FROM team_users AS tu
    WHERE
      tu.team_id IN (
        SELECT
          td.id
        FROM
          team_to_delete AS td
      )
    RETURNING
      user_id,
      team_id
  ),
  deleted_team_users_logs AS (
    INSERT INTO
      team_logs (authn_user_id, user_id, team_id, action)
    SELECT
      $authn_user_id,
      user_id,
      team_id,
      'leave'
    FROM
      deleted_team_users
  ),
  deleted_team AS (
    UPDATE teams AS t
    SET
      deleted_at = NOW()
    FROM
      team_to_delete AS td
    WHERE
      td.id = t.id
    RETURNING
      t.id
  ),
  deleted_team_log AS (
    INSERT INTO
      team_logs (authn_user_id, team_id, action)
    SELECT
      $authn_user_id,
      id,
      'delete'
    FROM
      deleted_team
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      modified_at = NOW()
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.team_id = $team_id
  )
SELECT
  id
FROM
  deleted_team;

-- BLOCK delete_all_teams
WITH
  assessment_teams AS (
    SELECT
      t.id
    FROM
      team_configs AS tc
      JOIN teams AS t ON (t.team_config_id = tc.id)
    WHERE
      tc.assessment_id = $assessment_id
      AND t.deleted_at IS NULL
      AND tc.deleted_at IS NULL
  ),
  deleted_team_users AS (
    DELETE FROM team_users
    WHERE
      team_id IN (
        SELECT
          id
        FROM
          assessment_teams
      )
    RETURNING
      user_id,
      team_id
  ),
  deleted_team_users_logs AS (
    INSERT INTO
      team_logs (authn_user_id, user_id, team_id, action)
    SELECT
      $authn_user_id,
      user_id,
      team_id,
      'leave'
    FROM
      deleted_team_users
  ),
  deleted_teams AS (
    UPDATE teams AS t
    SET
      deleted_at = NOW()
    FROM
      assessment_teams AS at
    WHERE
      t.id = at.id
    RETURNING
      t.id
  ),
  updated_assessment_instance AS (
    UPDATE assessment_instances AS ai
    SET
      modified_at = NOW()
    FROM
      deleted_teams AS dt
    WHERE
      ai.assessment_id = $assessment_id
      AND ai.team_id = dt.id
  )
INSERT INTO
  team_logs (authn_user_id, team_id, action)
SELECT
  $authn_user_id,
  id,
  'delete'
FROM
  deleted_teams;
