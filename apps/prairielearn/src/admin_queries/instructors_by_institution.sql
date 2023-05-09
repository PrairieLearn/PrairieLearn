SELECT
  i.short_name AS institution,
  plc.short_name AS course,
  plc.id AS course_id,
  u.uid,
  u.name,
  cp.course_role,
  cip.course_instance_role,
  array_agg(
    ci.short_name
    ORDER BY
      ci.id DESC
  ) FILTER (
    WHERE
      ci.short_name IS NOT NULL
  ) AS course_instances_with_permissions
FROM
  course_permissions AS cp
  JOIN users AS u USING (user_id)
  JOIN pl_courses AS plc ON (plc.id = cp.course_id)
  JOIN institutions AS i on (i.id = plc.institution_id)
  LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
  LEFT JOIN course_instances AS ci ON (ci.id = cip.course_instance_id)
WHERE
  i.short_name = $institution_shortname
  AND u.deleted_at IS NULL
  AND plc.deleted_at IS NULL
  AND ci.deleted_at IS NULL
  AND cp.course_role = ANY ($course_roles::enum_course_role[])
GROUP BY
  i.short_name,
  plc.short_name,
  plc.id,
  u.uid,
  u.name,
  cp.course_role,
  cip.course_instance_role
ORDER BY
  plc.short_name,
  u.uid;
