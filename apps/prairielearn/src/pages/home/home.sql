-- BLOCK select_instructor_courses
WITH
  admin_institutions AS (
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
  ),
  example_courses AS (
    SELECT
      c.short_name,
      c.title,
      c.id,
      c.example_course,
      TRUE AS can_open_course,
      coalesce(
        jsonb_agg(
          jsonb_build_object('long_name', ci.long_name, 'id', ci.id)
          ORDER BY
            d.start_date DESC NULLS LAST,
            d.end_date DESC NULLS LAST,
            ci.id DESC
        ),
        '[]'::jsonb
      ) AS course_instances
    FROM
      pl_courses AS c
      JOIN course_instances AS ci ON (
        ci.course_id = c.id
        AND ci.deleted_at IS NULL
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
      c.deleted_at IS NULL
      AND c.example_course IS TRUE
    GROUP BY
      c.id
  ),
  instructor_course_instances AS (
    SELECT
      c.id,
      jsonb_agg(
        jsonb_build_object('long_name', ci.long_name, 'id', ci.id)
        ORDER BY
          d.start_date DESC NULLS LAST,
          d.end_date DESC NULLS LAST,
          ci.id DESC
      ) AS course_instances
    FROM
      pl_courses AS c
      JOIN course_instances AS ci ON (
        ci.course_id = c.id
        AND ci.deleted_at IS NULL
      )
      LEFT JOIN course_permissions AS cp ON (
        cp.user_id = $user_id
        AND cp.course_id = c.id
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
      c.deleted_at IS NULL
      AND c.example_course IS FALSE
      AND (
        $is_administrator
        OR cp.course_role > 'None'
        OR cip.course_instance_role > 'None'
      )
    GROUP BY
      c.id,
      cp.id
  ),
  instructor_courses AS (
    SELECT
      c.short_name,
      c.title,
      c.id,
      c.example_course,
      (
        $is_administrator
        OR cp.course_role > 'None'
      ) AS can_open_course,
      coalesce(ici.course_instances, '[]'::jsonb) AS course_instances
    FROM
      pl_courses AS c
      LEFT JOIN course_permissions AS cp ON (
        cp.user_id = $user_id
        AND cp.course_id = c.id
      )
      LEFT JOIN instructor_course_instances AS ici ON (ici.id = c.id)
    WHERE
      c.deleted_at IS NULL
      AND c.example_course IS FALSE
      AND (
        $is_administrator
        OR cp.course_role > 'None'
        OR ici.id IS NOT NULL
      )
  )
SELECT
  ic.*
FROM
  instructor_courses AS ic
UNION ALL
SELECT
  ec.*
FROM
  example_courses AS ec
WHERE
  $include_example_course
  -- Example courses are shown if the user is an instructor in any course
  OR EXISTS (
    SELECT
      id
    FROM
      instructor_courses
  )
ORDER BY
  example_course,
  short_name,
  title,
  id;

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
