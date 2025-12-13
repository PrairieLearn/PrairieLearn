-- BLOCK select_users
SELECT
  u.user_id,
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
  JOIN users AS u ON (u.user_id = e.user_id)
WHERE
  a.id = $assessment_id
ORDER BY
  user_id;

-- BLOCK select_groups
SELECT
  u.user_id,
  u.uid,
  u.name,
  g.name AS group_name,
  c.id AS course_id,
  c.short_name AS course,
  ci.id AS course_instance_id,
  ci.short_name AS course_instance
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = ci.course_id)
  JOIN group_configs AS gc ON (gc.assessment_id = a.id)
  JOIN groups AS g ON (g.group_config_id = gc.id)
  JOIN LATERAL (
    SELECT
      *
    FROM
      group_users AS gu
    WHERE
      gu.group_id = g.id
    LIMIT
      1
  ) AS lgu ON (TRUE)
  JOIN users AS u ON (u.user_id = lgu.user_id)
WHERE
  a.id = $assessment_id
  -- This query only works for assessments with group work enabled
  AND a.group_work = TRUE
  AND g.deleted_at IS NULL
ORDER BY
  u.user_id;
