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
    encrypted_secret_key,
    created_by
  )
VALUES
  (
    $course_instance_id,
    $provider,
    $encrypted_secret_key,
    $created_by
  )
ON CONFLICT (course_instance_id, provider) DO UPDATE
SET
  encrypted_secret_key = EXCLUDED.encrypted_secret_key,
  created_at = NOW(),
  created_by = EXCLUDED.created_by
RETURNING
  *;

-- BLOCK delete_credential
DELETE FROM course_instance_ai_grading_credentials
WHERE
  id = $credential_id
  AND course_instance_id = $course_instance_id
RETURNING
  *;

-- BLOCK update_use_custom_api_keys
UPDATE course_instances
SET
  ai_grading_use_custom_api_keys = $ai_grading_use_custom_api_keys
WHERE
  id = $course_instance_id
RETURNING
  *;

-- BLOCK lock_course_instance
-- Serialize configuration changes while allowing grading jobs' foreign-key checks.
-- FOR UPDATE can deadlock with platform-provider grading: it updates assessment_questions
-- before the grading job checks its course-instance foreign key.
SELECT
  id
FROM
  course_instances
WHERE
  id = $course_instance_id
FOR NO KEY UPDATE;

-- BLOCK select_optional_custom_credential
SELECT
  *
FROM
  course_instance_ai_grading_credentials
WHERE
  course_instance_id = $course_instance_id
  AND provider = 'openai-compatible';

-- BLOCK select_optional_credential
SELECT
  *
FROM
  course_instance_ai_grading_credentials
WHERE
  course_instance_id = $course_instance_id
  AND id = $credential_id;

-- BLOCK insert_custom_credential
INSERT INTO
  course_instance_ai_grading_credentials (
    course_instance_id,
    provider,
    base_url,
    encrypted_secret_key,
    created_by
  )
VALUES
  (
    $course_instance_id,
    'openai-compatible',
    $base_url,
    $encrypted_secret_key,
    $created_by
  )
RETURNING
  *;

-- BLOCK clear_remembered_custom_model
UPDATE assessment_questions
SET
  ai_grading_last_selected_model = NULL
WHERE
  ai_grading_last_selected_credential_id = $credential_id;
