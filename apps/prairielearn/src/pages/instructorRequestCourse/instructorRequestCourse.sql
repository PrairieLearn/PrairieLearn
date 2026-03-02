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
