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

-- BLOCK select_course_instance
SELECT
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(c.*) AS course
FROM
  course_instances AS ci
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  ci.id = $course_instance_id;

-- BLOCK select_and_lock_institution
SELECT
  to_jsonb(i.*) AS institution
FROM
  institutions AS i
WHERE
  i.id = $institution_id
FOR NO KEY UPDATE OF
  i;

-- BLOCK select_enrollment_counts
WITH
  course_instance_enrollments AS (
    SELECT
      (
        CASE
          WHEN pg.id IS NOT NULL THEN 'paid'
          ELSE 'free'
        END
      ) AS kind,
      COUNT(e.*)::integer AS count
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
      JOIN institutions AS i ON (i.id = c.institution_id)
      LEFT JOIN plan_grants AS pg ON (
        pg.institution_id = i.id
        AND pg.course_instance_id = ci.id
        AND pg.enrollment_id = e.id
      )
    WHERE
      e.course_instance_id = $course_instance_id
    GROUP BY
      kind
  ),
  institution_enrollments AS (
    SELECT
      (
        CASE
          WHEN pg.id IS NOT NULL THEN 'paid'
          ELSE 'free'
        END
      ) AS kind,
      COUNT(e.*)::integer AS count
    FROM
      enrollments AS e
      JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
      JOIN institutions AS i ON (i.id = c.institution_id)
      LEFT JOIN plan_grants AS pg ON (
        pg.institution_id = i.id
        AND pg.course_instance_id = ci.id
        AND pg.enrollment_id = e.id
      )
    WHERE
      e.created_at > now() - interval '1 year'
      AND i.id = $institution_id
    GROUP BY
      kind
  )
SELECT
  COALESCE(ie.kind, cie.kind) AS kind,
  cie.count AS course_instance_enrollment_count,
  ie.count AS institution_enrollment_count
FROM
  course_instance_enrollments AS cie
  FULL OUTER JOIN institution_enrollments AS ie ON (ie.kind = cie.kind);

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
