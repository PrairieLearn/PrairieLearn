-- BLOCK insert_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id)
VALUES
  ($user_id, $course_instance_id)
RETURNING
  *;

-- BLOCK select_enrollment_for_user_in_course_instance
SELECT
  *
FROM
  enrollments
WHERE
  user_id = $user_id
  AND course_instance_id = $course_instance_id;

-- BLOCK select_enrollment_counts
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
  (
    $created_since::interval IS NULL
    OR e.created_at > now() - $created_since::interval
  )
  AND (
    $institution_id::bigint IS NULL
    OR i.id = $institution_id
  )
  AND (
    $course_instance_id::bigint IS NULL
    OR ci.id = $course_instance_id
  );
