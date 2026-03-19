-- BLOCK select_course_or_instance_context_data
SELECT
  to_jsonb(c.*) AS course,
  to_jsonb(i.*) AS institution,
  to_jsonb(ci.*) AS course_instance,
  CASE
  -- If user is institution admin, they have Owner permission
    WHEN ia.id IS NOT NULL THEN 'Owner'
    -- If user is staff member, use course_permissions to determine role
    ELSE COALESCE(cp.course_role, 'None')
  END AS course_role,
  CASE
  -- If user is institution admin, they have Editor permission
    WHEN ia.id IS NOT NULL THEN 'Student Data Editor'
    -- If user is staff member, use course_instance_permissions to determine role
    ELSE COALESCE(cip.course_instance_role, 'None')
  END AS course_instance_role,
  e.status AS enrollment_status
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
  LEFT JOIN course_instance_permissions AS cip ON (
    cip.course_instance_id = ci.id
    AND cip.course_permission_id = cp.id
  )
  LEFT JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
  LEFT JOIN enrollments AS e ON (
    e.course_instance_id = ci.id
    AND e.user_id = $user_id
  )
WHERE
  c.id = coalesce($course_id, ci.course_id)
  AND c.deleted_at IS NULL;

-- BLOCK select_course_instance_role
-- This is the same computation as above but restricted to the course instance role
SELECT
  CASE
    WHEN ia.id IS NOT NULL THEN 'Student Data Editor'
    ELSE COALESCE(cip.course_instance_role, 'None')
  END
FROM
  course_instances AS ci
  JOIN courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN course_permissions AS cp ON (
    cp.course_id = c.id
    AND cp.user_id = $user_id
  )
  LEFT JOIN course_instance_permissions AS cip ON (
    cip.course_instance_id = ci.id
    AND cip.course_permission_id = cp.id
  )
  LEFT JOIN institution_administrators AS ia ON (
    ia.institution_id = i.id
    AND ia.user_id = $user_id
  )
WHERE
  ci.id = $course_instance_id
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL;
