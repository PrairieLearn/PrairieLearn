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

-- BLOCK enroll
WITH
  enrollment_limits AS (
    SELECT
      i.id AS institution_id,
      i.yearly_enrollment_limit AS institution_yearly_enrollment_limit,
      -- Course instance enrollment limit overrides institution course instance
      -- enrollment limit to allow for higher limits on individual course instances.
      COALESCE(
        ci.enrollment_limit,
        i.course_instance_enrollment_limit
      ) AS course_instance_enrollment_limit
    FROM
      institutions AS i
      JOIN pl_courses AS c ON (c.institution_id = i.id)
      JOIN course_instances AS ci ON (ci.course_id = c.id)
    WHERE
      ci.id = $course_instance_id
      -- Lock institution to prevent concurrent enrollments that would exceed
      -- the enrollment limit.
    FOR UPDATE OF
      i
  ),
  course_instance_enrollments AS (
    SELECT
      COUNT(*) AS count
    FROM
      enrollments
    WHERE
      course_instance_id = $course_instance_id
  ),
  institution_enrollments AS (
    SELECT
      COUNT(*) AS count
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
      JOIN institutions AS i ON (i.id = c.institution_id)
      JOIN enrollment_limits AS el ON (el.institution_id = i.id)
    WHERE
      e.created_at > now() - interval '1 year'
  ),
  limits_exceeded AS (
    SELECT
      COALESCE(
        cie.count + 1 >= el.course_instance_enrollment_limit,
        FALSE
      ) AS course_instance_limit_exceeded,
      COALESCE(
        ie.count + 1 >= el.institution_yearly_enrollment_limit,
        FALSE
      ) AS institution_yearly_limit_exceeded
    FROM
      course_instance_enrollments AS cie
      CROSS JOIN institution_enrollments AS ie
      CROSS JOIN enrollment_limits AS el
  )
INSERT INTO
  enrollments AS e (user_id, course_instance_id)
SELECT
  u.user_id,
  $course_instance_id
FROM
  users AS u,
  limits_exceeded
WHERE
  u.user_id = $user_id
  AND check_course_instance_access (
    $course_instance_id,
    u.uid,
    u.institution_id,
    $req_date
  )
  AND NOT course_instance_limit_exceeded
  AND NOT institution_yearly_limit_exceeded
ON CONFLICT DO NOTHING
RETURNING
  e.id;

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
