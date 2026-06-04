-- BLOCK get_requests
SELECT
  to_jsonb(r.*) AS course_request,
  to_jsonb(u.*) AS approved_by_user
FROM
  course_requests AS r
  LEFT JOIN users AS u ON u.id = r.approved_by
WHERE
  r.user_id = $user_id
ORDER BY
  created_at DESC;

-- BLOCK get_existing_course_requests
SELECT
  EXISTS (
    SELECT
      cr.*
    FROM
      course_requests AS cr
    WHERE
      cr.user_id = $user_id
      AND LOWER(BTRIM(cr.short_name)) = LOWER(BTRIM($short_name))
  ) AS has_existing_request;
