-- BLOCK select_custom_endpoints
SELECT
  *
FROM
  course_instance_ai_grading_custom_endpoints
WHERE
  course_instance_id = $course_instance_id
ORDER BY
  created_at;

-- BLOCK select_custom_endpoint
SELECT
  *
FROM
  course_instance_ai_grading_custom_endpoints
WHERE
  id = $endpoint_id
  AND course_instance_id = $course_instance_id;

-- BLOCK insert_custom_endpoint
INSERT INTO
  course_instance_ai_grading_custom_endpoints (
    course_instance_id,
    name,
    base_url,
    encrypted_secret_key,
    created_by
  )
VALUES
  (
    $course_instance_id,
    $name,
    $base_url,
    $encrypted_secret_key,
    $created_by
  )
RETURNING
  *;

-- BLOCK delete_custom_endpoint
DELETE FROM course_instance_ai_grading_custom_endpoints
WHERE
  id = $endpoint_id
  AND course_instance_id = $course_instance_id
RETURNING
  *;
