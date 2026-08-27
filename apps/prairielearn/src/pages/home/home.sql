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
  user_identity AS (
    SELECT
      id,
      institution_id,
      uid,
      uin
    FROM
      users
    WHERE
      id = $user_id
  )
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(ci.*) AS course_instance,
  to_jsonb(e.*) AS enrollment,
  CASE
    WHEN ci.modern_publishing THEN ci.publishing_start_date
    ELSE NULLIF(d.min_start_date, '-infinity'::timestamptz)
  END AS start_date,
  CASE
    WHEN ci.modern_publishing THEN ci.publishing_end_date
    ELSE NULLIF(d.max_end_date, 'infinity'::timestamptz)
  END AS end_date,
  to_jsonb(extension.*) AS latest_publishing_extension,
  coalesce(e.user_id = identity.id, FALSE) AS matches_bound_user,
  coalesce(e.pending_uid = identity.uid, FALSE) AS matches_pending_uid,
  coalesce(
    identity.institution_id = c.institution_id
    AND identity.uin IS NOT NULL
    AND e.pending_uin = identity.uin,
    FALSE
  ) AS matches_institution_uin,
  FALSE AS matches_lti13
FROM
  enrollments AS e
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
  CROSS JOIN user_identity AS identity
  CROSS JOIN LATERAL (
    SELECT
      min(coalesce(ar.start_date, '-infinity'::timestamptz)) AS min_start_date,
      max(coalesce(ar.end_date, 'infinity'::timestamptz)) AS max_end_date
    FROM
      course_instance_access_rules AS ar
    WHERE
      ar.course_instance_id = ci.id
  ) AS d
  LEFT JOIN LATERAL (
    SELECT
      publishing_extension.*
    FROM
      course_instance_publishing_extension_enrollments AS extension_enrollment
      JOIN course_instance_publishing_extensions AS publishing_extension ON (
        publishing_extension.id = extension_enrollment.course_instance_publishing_extension_id
      )
    WHERE
      extension_enrollment.enrollment_id = e.id
      AND publishing_extension.course_instance_id = ci.id
    ORDER BY
      publishing_extension.end_date DESC,
      publishing_extension.id DESC
    LIMIT
      1
  ) AS extension ON ci.modern_publishing
WHERE
  (
    e.user_id = identity.id
    OR e.pending_uid = identity.uid
    OR (
      identity.institution_id = c.institution_id
      AND identity.uin IS NOT NULL
      AND e.pending_uin = identity.uin
    )
  )
  AND (
    ci.modern_publishing
    OR $req_date BETWEEN d.min_start_date AND d.max_end_date
  )
ORDER BY
  start_date DESC NULLS LAST,
  end_date DESC NULLS LAST,
  ci.id DESC,
  e.id DESC;

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
