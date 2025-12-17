-- BLOCK select_course_instances_legacy_access
SELECT
  c.short_name || ': ' || c.title || ', ' || ci.long_name AS label,
  c.short_name || ', ' || ci.long_name AS short_label,
  ci.id AS course_instance_id,
  to_jsonb(e) AS enrollment,
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
  ) AS d
WHERE
  u.user_id = $user_id
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND c.example_course IS FALSE
  AND check_course_instance_access (ci.id, u.uid, u.institution_id, $req_date)
  -- The enroll page is going away. We only consider legacy courses here.
  AND ci.modern_publishing IS FALSE
  AND (
    NOT ci.hide_in_enroll_page
    OR e.id IS NOT NULL
  )
ORDER BY
  c.short_name ASC,
  c.title ASC,
  c.id ASC,
  d.start_date DESC NULLS LAST,
  d.end_date DESC NULLS LAST,
  ci.id DESC;

-- BLOCK lti_course_instance_lookup
SELECT
  plc.short_name AS plc_short_name,
  ci.long_name AS ci_long_name
FROM
  course_instances AS ci
  JOIN pl_courses AS plc ON plc.id = ci.course_id
WHERE
  ci.id = $course_instance_id;
