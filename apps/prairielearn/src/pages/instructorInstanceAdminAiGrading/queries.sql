-- BLOCK select_credentials
SELECT
  *
FROM
  course_instance_ai_grading_credentials
WHERE
  course_instance_id = $course_instance_id
ORDER BY
  created_at;

-- BLOCK upsert_credential
INSERT INTO
  course_instance_ai_grading_credentials (
    course_instance_id,
    provider,
    encrypted_secret_key
  )
VALUES
  (
    $course_instance_id,
    $provider,
    $encrypted_secret_key
  )
ON CONFLICT (course_instance_id, provider) DO UPDATE
SET
  encrypted_secret_key = EXCLUDED.encrypted_secret_key,
  updated_at = NOW()
RETURNING
  *;

-- BLOCK delete_credential
DELETE FROM course_instance_ai_grading_credentials
WHERE
  id = $credential_id
  AND course_instance_id = $course_instance_id;

-- BLOCK update_use_custom_api_keys
UPDATE course_instances
SET
  ai_grading_use_custom_api_keys = $ai_grading_use_custom_api_keys
WHERE
  id = $course_instance_id
RETURNING
  *;
