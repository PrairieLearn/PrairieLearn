-- BLOCK select_users
SELECT
  u.id,
  u.uid,
  u.name,
  c.id AS course_id,
  c.short_name AS course,
  ci.id AS course_instance_id,
  ci.short_name AS course_instance
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
  JOIN enrollments AS e ON (e.course_instance_id = ci.id)
  JOIN users AS u ON (u.id = e.user_id)
WHERE
  a.id = $assessment_id
ORDER BY
  user_id;

-- BLOCK select_teams
SELECT
  u.id,
  u.uid,
  u.name,
  t.name AS group_name,
  c.id AS course_id,
  c.short_name AS course,
  ci.id AS course_instance_id,
  ci.short_name AS course_instance
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
  JOIN team_configs AS tc ON (tc.assessment_id = a.id)
  JOIN teams AS t ON (t.team_config_id = tc.id)
  JOIN LATERAL (
    SELECT
      *
    FROM
      team_users AS tu
    WHERE
      tu.team_id = t.id
    LIMIT
      1
  ) AS ltu ON (TRUE)
  JOIN users AS u ON (u.id = ltu.user_id)
WHERE
  a.id = $assessment_id
  -- This query only works for assessments with team work enabled
  AND a.team_work = TRUE
  AND t.deleted_at IS NULL
ORDER BY
  u.id;
