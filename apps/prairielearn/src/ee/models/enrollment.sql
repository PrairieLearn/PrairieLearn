-- BLOCK select_enrollment_counts_for_institution
SELECT
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NULL
    )
  )::integer AS free,
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NOT NULL
    )
  )::integer AS paid
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
  JOIN pl_courses AS c ON (ci.course_id = c.id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN plan_grants AS pg ON (
    pg.institution_id = i.id
    AND pg.course_instance_id = ci.id
    AND pg.user_id = e.user_id
    AND pg.plan_name = 'basic'
  )
WHERE
  e.created_at > now() - $created_since::interval
  AND i.id = $institution_id;

-- BLOCK select_enrollment_counts_for_course
SELECT
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NULL
    )
  )::integer AS free,
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NOT NULL
    )
  )::integer AS paid
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
  JOIN pl_courses AS c ON (ci.course_id = c.id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN plan_grants AS pg ON (
    pg.institution_id = i.id
    AND pg.course_instance_id = ci.id
    AND pg.user_id = e.user_id
    AND pg.plan_name = 'basic'
  )
WHERE
  e.created_at > now() - $created_since::interval
  AND c.id = $course_id;

-- BLOCK select_enrollment_counts_for_course_instance
SELECT
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NULL
    )
  )::integer AS free,
  (
    COUNT(*) FILTER (
      WHERE
        pg.id IS NOT NULL
    )
  )::integer AS paid
FROM
  enrollments AS e
  JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
  JOIN pl_courses AS c ON (ci.course_id = c.id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN plan_grants AS pg ON (
    pg.institution_id = i.id
    AND pg.course_instance_id = ci.id
    AND pg.user_id = e.user_id
    AND pg.plan_name = 'basic'
  )
WHERE
  ci.id = $course_instance_id;
