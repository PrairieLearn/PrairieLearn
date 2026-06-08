-- BLOCK select_pending_course_request_count
SELECT
  count(*)::integer
FROM
  course_requests
WHERE
  approved_status NOT IN ('approved', 'denied');
