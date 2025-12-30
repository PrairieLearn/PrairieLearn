--BLOCK config_info
SELECT
  *
FROM
  team_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK select_team_users
WITH
  assessment_teams AS (
    SELECT
      t.id,
      t.name
    FROM
      teams AS t
    WHERE
      t.deleted_at IS NULL
      AND t.team_config_id = $team_config_id
  ),
  assessment_team_users AS (
    SELECT
      t.id AS team_id,
      COUNT(u.uid)::integer AS size,
      jsonb_agg(jsonb_build_object('uid', u.uid, 'id', u.id)) AS users
    FROM
      assessment_teams AS t
      JOIN team_users AS tu ON (tu.team_id = t.id)
      JOIN users AS u ON (u.id = tu.user_id)
    GROUP BY
      t.id
  )
SELECT
  at.id AS team_id,
  at.name,
  COALESCE(atu.size, 0) AS size,
  COALESCE(atu.users, '[]'::jsonb) AS users
FROM
  assessment_teams AS at
  LEFT JOIN assessment_team_users AS atu ON (atu.team_id = at.id)
ORDER BY
  at.id;

-- BLOCK select_not_in_team
SELECT
  u.uid
FROM
  teams AS t
  JOIN team_users AS tu ON tu.team_id = t.id
  AND t.team_config_id = $team_config_id
  AND t.deleted_at IS NULL
  RIGHT JOIN enrollments AS e ON e.user_id = tu.user_id -- noqa: CV08
  JOIN users AS u ON u.id = e.user_id
WHERE
  t.id IS NULL
  AND e.course_instance_id = $course_instance_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
ORDER BY
  u.uid;
