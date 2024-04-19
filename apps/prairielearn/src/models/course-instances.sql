-- BLOCK select_course_instance_by_id
SELECT
  ci.*
FROM
  course_instances AS ci
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_course_instances_with_staff_access
SELECT
  ci.*,
  CASE
    WHEN d.start_date IS NULL THEN '—'
    ELSE format_date_full_compact (d.start_date, ci.display_timezone)
  END AS formatted_start_date,
  CASE
    WHEN d.end_date IS NULL THEN '—'
    ELSE format_date_full_compact (d.end_date, ci.display_timezone)
  END AS formatted_end_date,
  COALESCE(
    $is_administrator
    OR cip.course_instance_role > 'None',
    FALSE
  ) AS has_course_instance_permission_view
FROM
  pl_courses AS c
  JOIN course_instances AS ci ON (
    ci.course_id = c.id
    AND ci.deleted_at IS NULL
  )
  LEFT JOIN course_permissions AS cp ON (
    cp.user_id = $user_id
    AND cp.course_id = $course_id
  )
  LEFT JOIN course_instance_permissions AS cip ON (
    cip.course_permission_id = cp.id
    AND cip.course_instance_id = ci.id
  ),
  LATERAL (
    SELECT
      min(ar.start_date) AS start_date,
      max(ar.end_date) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
WHERE
  c.id = $course_id
  AND c.deleted_at IS NULL
  --  If either the user is an administrator, the user has a non-None course
  --  role, or the course is the example course, then select all course
  --  instances. Otherwise, select all course instances for which the user has a
  --  non-None course instance role.
  AND (
    $is_administrator
    OR cp.course_role > 'None'
    OR cip.course_instance_role > 'None'
    OR c.example_course IS TRUE
  )
ORDER BY
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;
