-- BLOCK select_feature_grants
SELECT
  fg.*,
  i.short_name AS institution_short_name,
  i.long_name AS institution_long_name,
  c.short_name AS course_short_name,
  c.title AS course_title,
  ci.short_name AS course_instance_short_name,
  ci.long_name AS course_instance_long_name,
  u.uid AS user_uid,
  u.name AS user_name
FROM
  feature_grants AS fg
  LEFT JOIN institutions AS i ON (i.id = fg.institution_id)
  LEFT JOIN pl_courses AS c ON (c.id = fg.course_id)
  LEFT JOIN course_instances AS ci ON (ci.id = fg.course_instance_id)
  LEFT JOIN users AS u ON (u.user_id = fg.user_id)
WHERE
  fg.name = $name
ORDER BY
  i.id ASC NULLS FIRST,
  c.id ASC NULLS FIRST,
  ci.id ASC NULLS FIRST,
  u.user_id ASC NULLS FIRST;

-- BLOCK select_institutions
SELECT
  *
FROM
  institutions;

-- BLOCK select_courses_for_institution
SELECT
  *
FROM
  pl_courses
WHERE
  institution_id = $institution_id;

-- BLOCK select_course_instances_for_course
SELECT
  *
FROM
  course_instances
WHERE
  course_id = $course_id;
