-- BLOCK get_course_request
SELECT
  *
FROM
  course_requests
WHERE
  id = $course_request_id;

-- BLOCK set_course_request_status
UPDATE course_requests AS cr
SET
  approved_status = $status
WHERE
  id = $course_request_id;

-- BLOCK set_course_owner_permission
INSERT INTO
  course_permissions (course_id, user_id, course_role)
SELECT
  $course_id,
  user_id,
  'Owner'
FROM
  course_requests
WHERE
  id = $course_request_id;
