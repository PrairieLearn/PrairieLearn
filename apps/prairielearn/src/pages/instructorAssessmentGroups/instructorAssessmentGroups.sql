--BLOCK config_info
SELECT
  *
FROM
  group_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK assessment_list
SELECT
  id,
  tid,
  title
FROM
  assessments
WHERE
  group_work
  AND id != $assessment_id
  AND course_instance_id = $course_instance_id
ORDER BY
  tid;

-- BLOCK select_group_users
WITH
  assessment_groups AS (
    SELECT
      g.id,
      g.name
    FROM
      groups AS g
    WHERE
      g.deleted_at IS NULL
      AND g.group_config_id = $group_config_id
  ),
  assessment_group_users AS (
    SELECT
      g.id AS group_id,
      COUNT(u.uid)::integer AS size,
      array_agg(u.uid) AS uid_list
    FROM
      assessment_groups AS g
      JOIN group_users AS gu ON (gu.group_id = g.id)
      JOIN users AS u ON (u.user_id = gu.user_id)
    GROUP BY
      g.id
  )
SELECT
  ag.id AS group_id,
  ag.name,
  COALESCE(agu.size, 0) AS size,
  COALESCE(agu.uid_list, ARRAY[]::TEXT[]) AS uid_list
FROM
  assessment_groups AS ag
  LEFT JOIN assessment_group_users AS agu ON (agu.group_id = ag.id)
ORDER BY
  ag.id;

-- BLOCK select_not_in_group
SELECT
  u.uid
FROM
  groups AS g
  JOIN group_users AS gu ON gu.group_id = g.id
  AND g.group_config_id = $group_config_id
  AND g.deleted_at IS NULL
  RIGHT JOIN enrollments AS e ON e.user_id = gu.user_id
  JOIN users AS u ON u.user_id = e.user_id
WHERE
  g.id IS NULL
  AND e.course_instance_id = $course_instance_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
ORDER BY
  u.uid;
