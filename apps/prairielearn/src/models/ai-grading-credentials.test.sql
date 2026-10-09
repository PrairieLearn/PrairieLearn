-- BLOCK insert_custom_credential
INSERT INTO
  course_instance_ai_grading_credentials (
    course_instance_id,
    created_by,
    provider,
    encrypted_secret_key,
    base_url
  )
SELECT
  aq_ci.id,
  $created_by,
  'openai-compatible',
  'test-encrypted-key',
  $base_url
FROM
  course_instances AS aq_ci
WHERE
  aq_ci.short_name = 'Sp15'
RETURNING
  id;

-- BLOCK remember_custom_credential
UPDATE assessment_questions
SET
  ai_grading_last_selected_credential_id = $credential_id,
  ai_grading_last_selected_model = 'custom-test-model'
WHERE
  id = (
    SELECT
      min(id)
    FROM
      assessment_questions
  )
RETURNING
  id;

-- BLOCK delete_custom_credential
DELETE FROM course_instance_ai_grading_credentials
WHERE
  id = $credential_id;

-- BLOCK select_remembered_model
SELECT
  ai_grading_last_selected_credential_id,
  ai_grading_last_selected_model
FROM
  assessment_questions
WHERE
  id = $assessment_question_id;
