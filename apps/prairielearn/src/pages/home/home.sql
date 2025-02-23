-- BLOCK select_student_courses
SELECT
  c.short_name AS course_short_name,
  c.title AS course_title,
  ci.long_name,
  ci.id
FROM
  users AS u
  JOIN enrollments AS e ON (e.user_id = u.user_id)
  JOIN course_instances AS ci ON (
    ci.id = e.course_instance_id
    AND ci.deleted_at IS NULL
    AND check_course_instance_access (ci.id, u.uid, u.institution_id, $req_date)
  )
  JOIN pl_courses AS c ON (
    c.id = ci.course_id
    AND c.deleted_at IS NULL
    AND (
      c.example_course IS FALSE
      OR $include_example_course_enrollments
    )
    AND users_is_instructor_in_course ($user_id, c.id) IS FALSE
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
  u.user_id = $user_id
ORDER BY
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK select_admin_institutions
-- Note that we only consider institutions where the user is explicitly
-- added as an administrator. We do not include all institutions if the
-- user is a global administrator, as that would be a very long list.
--
-- Global admins can access institutions/courses via the admin pages.
SELECT
  i.*
FROM
  institutions AS i
  JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
ORDER BY
  i.short_name,
  i.long_name,
  i.id;
