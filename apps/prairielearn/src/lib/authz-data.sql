-- BLOCK select_course_or_instance_context_data
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(i.*) AS institution,
  to_jsonb(ci.*) AS course_instance,
  jsonb_build_object(
    'course_role',
    CASE
    -- If user is institution admin, they are course owner
      WHEN ia.id IS NOT NULL THEN 'Owner'::enum_course_role
      ELSE
      -- If user is staff member, use course_permissions to determine role
      COALESCE(
        cp.course_role::enum_course_role,
        'None'::enum_course_role
      )
    END
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
  LEFT JOIN course_permissions AS cp ON (
    cp.course_id = c.id
    AND cp.user_id = $user_id
  )
  LEFT JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
  JOIN LATERAL authz_course_instance ($user_id, ci.id, $req_date) AS permissions_course_instance ON TRUE
WHERE
  c.id = coalesce($course_id, ci.course_id)
  AND c.deleted_at IS NULL;
