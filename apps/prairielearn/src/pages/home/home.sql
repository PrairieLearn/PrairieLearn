-- BLOCK select_home
WITH
  example_courses AS (
    SELECT
      c.short_name || ': ' || c.title AS label,
      c.short_name,
      c.title,
      c.id,
      TRUE AS do_link,
      coalesce(
        jsonb_agg(
          jsonb_build_object('label', ci.long_name, 'id', ci.id)
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
    ORDER BY
      c.short_name,
      c.title,
      c.id
  ),
  instructor_course_instances AS (
    SELECT
      c.id,
      jsonb_agg(
        jsonb_build_object('label', ci.long_name, 'id', ci.id)
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
      c.short_name || ': ' || c.title AS label,
      c.short_name,
      c.title,
      c.id,
      (
        $is_administrator
        OR cp.course_role > 'None'
      ) AS do_link,
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
    ORDER BY
      c.short_name,
      c.title,
      c.id
  ),
  student_courses AS (
    SELECT
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'label',
            c.short_name || ': ' || c.title || ', ' || ci.long_name,
            'id',
            ci.id
          )
          ORDER BY
            d.start_date DESC NULLS LAST,
            d.end_date DESC NULLS LAST,
            ci.id DESC
        ),
        '[]'::jsonb
      ) AS course_instances
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
          or $include_example_course_enrollments
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
  )
SELECT
  ec.courses AS example_courses,
  ic.courses AS instructor_courses,
  sc.course_instances AS student_courses
FROM
  (
    SELECT
      coalesce(
        jsonb_agg(
          ec.*
          ORDER BY
            ec.short_name,
            ec.title,
            ec.id
        ),
        '[]'::jsonb
      ) AS courses
    FROM
      example_courses AS ec
  ) AS ec,
  (
    SELECT
      coalesce(
        jsonb_agg(
          ic.*
          ORDER BY
            ic.short_name,
            ic.title,
            ic.id
        ),
        '[]'::jsonb
      ) AS courses
    FROM
      instructor_courses AS ic
  ) AS ic,
  student_courses AS sc;
