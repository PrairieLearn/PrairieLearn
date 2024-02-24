-- BLOCK select_assessment_info
SELECT
  assessment_label (a, aset) AS assessment_label,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_enrolled_students_without_group
WITH
  students_in_groups AS (
    SELECT
      gu.*
    FROM
      group_users AS gu
      JOIN groups AS g ON (g.id = gu.group_id)
      JOIN group_configs AS gc ON (gc.id = g.group_config_id)
    WHERE
      gc.assessment_id = $assessment_id
      AND gc.deleted_at IS NULL
      AND g.deleted_at IS NULL
  )
SELECT
  u.*
FROM
  assessments AS a
  JOIN enrollments AS e ON e.course_instance_id = a.course_instance_id
  JOIN users AS u ON u.user_id = e.user_id
  LEFT JOIN students_in_groups AS sig ON (sig.user_id = u.user_id)
WHERE
  a.id = $assessment_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id)
  AND sig.group_id IS NULL;

-- BLOCK select_unused_group_name_suffix
SELECT
  SUBSTRING(
    g.name
    FROM
      6
  )::INTEGER + 1 AS group_number
FROM
  groups AS g
  JOIN group_configs AS gc ON (gc.id = g.group_config_id)
WHERE
  gc.assessment_id = $assessment_id
  AND g.name ~ '^group[0-9]+$'
  AND g.deleted_at IS NULL
ORDER BY
  group_number DESC
LIMIT
  1;
