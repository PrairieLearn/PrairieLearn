WITH
  selected_users AS (
    SELECT
      *
    FROM
      users
    WHERE
      uid ~ $user_regexp
      OR name ~ $user_regexp
    LIMIT
      10
  ),
  selected_courses AS (
    (
      SELECT
        u.uid,
        u.name,
        u.uin,
        i.short_name AS institution,
        c.short_name AS course,
        c.id AS course_id,
        ci.short_name AS course_instance,
        ci.id AS course_instance_id,
        'Student' AS role
      FROM
        selected_users AS u
        JOIN enrollments AS e ON (e.user_id = u.user_id)
        JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
      LIMIT
        500
    )
    UNION
    (
      SELECT
        u.uid,
        u.name,
        u.uin,
        i.short_name AS institution,
        c.short_name AS course,
        c.id AS course_id,
        ci.short_name AS course_instance,
        ci.id AS course_instance_id,
        cip.course_instance_role::text AS role
      FROM
        selected_users AS u
        JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
        JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
        JOIN course_instances AS ci ON (ci.id = cip.course_instance_id)
        JOIN pl_courses AS c ON (c.id = cp.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
      WHERE
        cip.course_instance_role > 'None'
      LIMIT
        500
    )
    UNION
    (
      SELECT
        u.uid,
        u.name,
        u.uin,
        i.short_name AS institution,
        c.short_name AS course,
        c.id AS course_id,
        NULL AS course_instance,
        NULL course_instance_id,
        'Course Content ' || cp.course_role AS role
      FROM
        selected_users AS u
        JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
        JOIN pl_courses AS c ON (c.id = cp.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
      WHERE
        cp.course_role > 'None'
      LIMIT
        500
    )
  )
SELECT
  *
FROM
  selected_courses
ORDER BY
  uid,
  name,
  uin,
  institution,
  course,
  course_instance,
  role;
