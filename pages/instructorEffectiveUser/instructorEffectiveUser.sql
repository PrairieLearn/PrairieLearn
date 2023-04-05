-- BLOCK select
SELECT
  to_jsonb(
    enum_range(
      enum_first(null::enum_course_role),
      $authn_course_role
    )
  ) AS available_course_roles,
  to_jsonb(
    enum_range(
      enum_first(null::enum_course_instance_role),
      $authn_course_instance_role
    )
  ) AS available_course_instance_roles,
  (
    SELECT
      jsonb_agg(
        u.uid
        ORDER BY
          u.uid
      )
    FROM
      users AS u
      JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
      AND (cp.course_id = $course_id)
    WHERE
      cp.course_role <= $authn_course_role
  ) AS available_uids;
