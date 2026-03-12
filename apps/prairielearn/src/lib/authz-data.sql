-- BLOCK select_course_or_instance_context_data
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(i.*) AS institution,
  to_jsonb(ci.*) AS course_instance,
  jsonb_build_object(
    'course_role',
    COALESCE(
      (
        -- If user is institution admin, they are course owner
        SELECT
          'Owner'::enum_course_role
        FROM
          institution_administrators AS ia
          JOIN institutions AS i ON (i.id = ia.institution_id)
          JOIN courses AS c ON (c.institution_id = i.id)
        WHERE
          c.id = $course_id
          AND ia.user_id = $user_id
      ),
      (
        -- If user is staff member, use course_permissions to determine role
        SELECT
          cp.course_role::enum_course_role
        FROM
          course_permissions AS cp
        WHERE
          cp.user_id = $user_id
          AND cp.course_id = $course_id
      ),
      -- Otherwise, user has no role in the course
      'None'::enum_course_role
    )
  ) AS permissions_course,
  permissions_course_instance.*
FROM
  courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN course_instances AS ci ON (
    (c.id = ci.course_id)
    AND (ci.id = $course_instance_id)
    AND (ci.deleted_at IS NULL)
  )
  JOIN LATERAL authz_course_instance ($user_id, ci.id, $req_date) AS permissions_course_instance ON TRUE
WHERE
  c.id = coalesce($course_id, ci.course_id)
  AND c.deleted_at IS NULL;
