-- BLOCK insert_custom_credential
INSERT INTO
  course_instance_ai_grading_credentials (
    course_instance_id,
    provider,
    encrypted_secret_key,
    created_by,
    base_url,
    model_capabilities
  )
VALUES
  (
    1,
    $provider,
    $encrypted_secret_key,
    $created_by,
    $base_url,
    $model_capabilities::jsonb
  );

-- BLOCK delete_custom_credentials
DELETE FROM course_instance_ai_grading_credentials
WHERE
  course_instance_id = 1
  AND provider = 'openai-compatible';
