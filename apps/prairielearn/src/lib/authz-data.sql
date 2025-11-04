-- BLOCK select_authz_data
SELECT
  access_mode.mode,
  access_mode.mode_reason,
  to_jsonb(c.*) AS course,
  to_jsonb(i.*) AS institution,
  to_jsonb(ci.*) AS course_instance,
  permissions_course.*,
  permissions_course_instance.*
FROM
  pl_courses AS c
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN course_instances AS ci ON (
    (c.id = ci.course_id)
    AND (ci.id = $course_instance_id)
    AND (ci.deleted_at IS NULL)
  )
  JOIN LATERAL authz_course ($user_id, c.id) AS permissions_course ON TRUE
  JOIN LATERAL authz_course_instance ($user_id, ci.id, $req_date) AS permissions_course_instance ON TRUE
  JOIN ip_to_mode ($ip, $req_date, $user_id) AS access_mode ON TRUE
WHERE
  c.id = coalesce($course_id, ci.course_id)
  AND c.deleted_at IS NULL
  AND (
    (permissions_course ->> 'course_role')::enum_course_role > 'None'
    OR (
      permissions_course_instance ->> 'course_instance_role'
    )::enum_course_instance_role > 'None'
    OR (
      permissions_course_instance ->> 'has_student_access'
    )::boolean IS TRUE
  );
