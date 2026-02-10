--BLOCK config_info
SELECT
  *
FROM
  team_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK select_group_users
WITH
  assessment_groups AS (
    SELECT
      g.id,
      g.name
    FROM
      teams AS g
    WHERE
      g.deleted_at IS NULL
      AND g.team_config_id = $group_config_id
  ),
  assessment_group_users AS (
    SELECT
      g.id AS team_id,
      COUNT(u.uid)::integer AS size,
      jsonb_agg(jsonb_build_object('uid', u.uid, 'id', u.id)) AS users
    FROM
      assessment_groups AS g
      JOIN team_users AS gu ON (gu.team_id = g.id)
      JOIN users AS u ON (u.id = gu.user_id)
    GROUP BY
      g.id
  )
SELECT
  ag.id AS group_id,
  ag.name,
  COALESCE(agu.size, 0) AS size,
  COALESCE(agu.users, '[]'::jsonb) AS users
FROM
  assessment_groups AS ag
  LEFT JOIN assessment_group_users AS agu ON (agu.team_id = ag.id)
ORDER BY
  ag.id;

-- BLOCK select_not_in_group
SELECT
  u.uid
FROM
  teams AS g
  JOIN team_users AS gu ON gu.team_id = g.id
  AND g.team_config_id = $group_config_id
  AND g.deleted_at IS NULL
  RIGHT JOIN enrollments AS e ON e.user_id = gu.user_id -- noqa: CV08
  JOIN users AS u ON u.id = e.user_id
WHERE
  g.id IS NULL
  AND e.course_instance_id = $course_instance_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
ORDER BY
  u.uid;
