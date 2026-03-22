-- BLOCK select_instructor_courses
WITH
  example_courses AS (
    SELECT
      c.short_name,
      c.title,
      c.id,
      c.example_course,
      TRUE AS can_open_course,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'long_name',
            ci.long_name,
            'id',
            ci.id,
            'expired',
            FALSE -- Example courses never expire
          )
          ORDER BY
            d.start_date DESC NULLS LAST,
            d.end_date DESC NULLS LAST,
            ci.id DESC
        ) FILTER (
          WHERE
            ci.id IS NOT NULL
        ),
        '[]'::jsonb
      ) AS course_instances
    FROM
      courses AS c
      LEFT JOIN course_instances AS ci ON (
        ci.course_id = c.id
        AND ci.deleted_at IS NULL
      ),
      LATERAL (
        SELECT
          COALESCE(ci.publishing_start_date, min(ar.start_date)) AS start_date,
          COALESCE(ci.publishing_end_date, max(ar.end_date)) AS end_date
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
        jsonb_build_object(
          'long_name',
          ci.long_name,
          'id',
          ci.id,
          'expired',
          -- If no access rules exist, it is typically either a sandbox or a
          -- future CI that has not yet been configured. In both cases it should
          -- not be considered expired.
          coalesce(d.expired, FALSE)
        )
        ORDER BY
          d.start_date DESC NULLS LAST,
          d.end_date DESC NULLS LAST,
          ci.id DESC
      ) AS course_instances
    FROM
      courses AS c
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
          -- Use new publishing dates if available, otherwise fall back to legacy access rules
          COALESCE(ci.publishing_start_date, min(ar.start_date)) AS start_date,
          COALESCE(ci.publishing_end_date, max(ar.end_date)) AS end_date,
          -- Check if expired using new publishing dates or legacy access rules.
          -- Use a tolerance of 1 month to allow instructors to easily see recently expired courses.
          CASE
            WHEN ci.publishing_end_date IS NOT NULL THEN ci.publishing_end_date < now() - interval '1 month'
            ELSE bool_and(
              ar.end_date IS NOT NULL
              AND ar.end_date < now() - interval '1 month'
            )
          END AS expired
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
      courses AS c
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
WITH
  -- Base query: all enrollments for this user with course/course_instance data
  base_enrollments AS (
    SELECT
      e.id AS enrollment_id,
      c.id AS course_id,
      c.short_name AS course_short_name,
      c.title AS course_title,
      ci.id AS course_instance_id,
      ci.modern_publishing,
      ci.publishing_start_date,
      ci.publishing_end_date,
      to_jsonb(ci) AS course_instance,
      to_jsonb(e) AS enrollment,
      u.uid,
      u.institution_id
    FROM
      enrollments AS e
      LEFT JOIN users AS u ON (u.id = e.user_id)
      JOIN course_instances AS ci ON (
        ci.id = e.course_instance_id
        AND ci.deleted_at IS NULL
      )
      JOIN courses AS c ON (
        c.id = ci.course_id
        AND c.deleted_at IS NULL
        AND (
          c.example_course IS FALSE
          OR $include_example_course_enrollments
        )
      )
    WHERE
      e.user_id = $user_id
      OR e.pending_uid = $pending_uid
  ),
  -- Legacy courses: use access rules for dates and check_course_instance_access for filtering
  legacy_courses AS (
    SELECT
      be.course_id,
      be.course_short_name,
      be.course_title,
      be.course_instance,
      be.enrollment,
      NULL::jsonb AS latest_publishing_extension,
      d.start_date,
      d.end_date,
      be.course_instance_id
    FROM
      base_enrollments AS be,
      LATERAL (
        SELECT
          min(ar.start_date) AS start_date,
          max(ar.end_date) AS end_date
        FROM
          course_instance_access_rules AS ar
        WHERE
          ar.course_instance_id = be.course_instance_id
      ) AS d
    WHERE
      be.modern_publishing IS FALSE
      AND check_course_instance_access (
        be.course_instance_id,
        be.uid,
        be.institution_id,
        $req_date
      )
  ),
  -- Modern courses: use publishing dates directly and fetch extension data
  modern_courses AS (
    SELECT
      be.course_id,
      be.course_short_name,
      be.course_title,
      be.course_instance,
      be.enrollment,
      to_jsonb(cie) AS latest_publishing_extension,
      be.publishing_start_date AS start_date,
      be.publishing_end_date AS end_date,
      be.course_instance_id
    FROM
      base_enrollments AS be
      LEFT JOIN LATERAL (
        SELECT
          cie.*
        FROM
          course_instance_publishing_extension_enrollments AS ciee
          JOIN course_instance_publishing_extensions AS cie ON (
            cie.id = ciee.course_instance_publishing_extension_id
          )
        WHERE
          ciee.enrollment_id = be.enrollment_id
        ORDER BY
          cie.end_date DESC NULLS LAST,
          cie.id DESC
        LIMIT
          1
      ) AS cie ON TRUE
    WHERE
      be.modern_publishing IS TRUE
  )
SELECT
  *
FROM
  legacy_courses
UNION ALL
SELECT
  *
FROM
  modern_courses
ORDER BY
  start_date DESC NULLS LAST,
  end_date DESC NULLS LAST,
  course_instance_id DESC;

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
