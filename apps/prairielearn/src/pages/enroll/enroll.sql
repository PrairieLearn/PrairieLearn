-- BLOCK select_course_instances
SELECT
  c.short_name || ': ' || c.title || ', ' || ci.long_name AS label,
  c.short_name || ', ' || ci.long_name AS short_label,
  ci.id AS course_instance_id,
  (e.id IS NOT NULL) AS enrolled,
  users_is_instructor_in_course (u.user_id, c.id) AS instructor_access
FROM
  users AS u
  CROSS JOIN (
    course_instances AS ci
    JOIN pl_courses AS c ON (c.id = ci.course_id)
  )
  LEFT JOIN enrollments AS e ON (
    e.user_id = u.user_id
    AND e.course_instance_id = ci.id
  ),
  LATERAL (
    SELECT
      min(ar.start_date) AS start_date,
      max(ar.end_date) AS end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
      AND ((ar.role > 'Student') IS NOT TRUE)
  ) AS d
WHERE
  u.user_id = $user_id
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.example_course IS FALSE
  AND check_course_instance_access (ci.id, u.uid, u.institution_id, $req_date)
  AND (
    NOT ci.hide_in_enroll_page
    OR e.id IS NOT NULL
  )
ORDER BY
  c.short_name,
  c.title,
  c.id,
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK select_and_lock_enrollment_counts
WITH
  institution AS (
    SELECT
      i.*
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
    WHERE
      ci.id = $course_instance_id
    FOR NO KEY UPDATE OF
      i
  ),
  course_instance_enrollments AS (
    SELECT
      COUNT(*)::integer AS count
    FROM
      enrollments
    WHERE
      course_instance_id = $course_instance_id
  ),
  institution_enrollments AS (
    SELECT
      COUNT(*)::integer AS count
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
      JOIN institution AS i ON (i.id = c.institution_id)
    WHERE
      e.created_at > now() - interval '1 year'
  )
SELECT
  to_jsonb(i.*) AS institution,
  to_jsonb(ci.*) AS course_instance,
  course_instance_enrollments.count AS course_instance_enrollment_count,
  institution_enrollments.count AS institution_enrollment_count
FROM
  course_instances AS ci,
  institution AS i,
  course_instance_enrollments,
  institution_enrollments
WHERE
  ci.id = $course_instance_id;

-- BLOCK enroll
INSERT INTO
  enrollments AS e (user_id, course_instance_id)
SELECT
  u.user_id,
  $course_instance_id
FROM
  users AS u
WHERE
  u.user_id = $user_id
  AND check_course_instance_access (
    $course_instance_id,
    u.uid,
    u.institution_id,
    $req_date
  )
ON CONFLICT DO NOTHING;

-- BLOCK unenroll
DELETE FROM enrollments AS e USING users AS u
WHERE
  u.user_id = $user_id
  AND e.user_id = $user_id
  AND e.course_instance_id = $course_instance_id
  AND check_course_instance_access (
    $course_instance_id,
    u.uid,
    u.institution_id,
    $req_date
  )
RETURNING
  e.id;

-- BLOCK lti_course_instance_lookup
SELECT
  plc.short_name AS plc_short_name,
  ci.long_name AS ci_long_name
FROM
  course_instances AS ci
  JOIN pl_courses AS plc ON plc.id = ci.course_id
WHERE
  ci.id = $course_instance_id;
