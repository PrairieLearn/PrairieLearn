SELECT
  u.user_id,
  u.uid,
  u.name,
  g.name AS group_name,
  c.id AS course_id,
  c.short_name AS course,
  ci.id AS course_instance_id,
  ci.short_name AS course_instance,
  a.id AS assessment_id,
  a.title AS assessment,
  aii.assessment_instance_id
FROM
  assessments AS a
  JOIN course_instances AS ci on (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
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
  JOIN assessment_instances_insert (a.id, u.user_id, a.group_work, u.user_id, $mode) AS aii ON TRUE
WHERE
  a.id = $assessment_id
  AND g.deleted_at IS NULL
ORDER BY
  aii.assessment_instance_id;
