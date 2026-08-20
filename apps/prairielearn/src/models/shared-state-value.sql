-- BLOCK select_assessment_instance_id_for_instance_question
SELECT
  iq.assessment_instance_id
FROM
  instance_questions AS iq
WHERE
  iq.id = $instance_question_id;

-- BLOCK select_value
SELECT
  *
FROM
  assessment_instance_shared_state_values
WHERE
  assessment_instance_id = $assessment_instance_id
  AND shared_state_object_id = $shared_state_object_id;

-- BLOCK select_value_for_update
SELECT
  *
FROM
  assessment_instance_shared_state_values
WHERE
  assessment_instance_id = $assessment_instance_id
  AND shared_state_object_id = $shared_state_object_id
FOR UPDATE;

-- BLOCK upsert_value
INSERT INTO
  assessment_instance_shared_state_values (
    assessment_instance_id,
    shared_state_object_id,
    revision_id,
    data,
    write_seq
  )
VALUES
  (
    $assessment_instance_id,
    $shared_state_object_id,
    $revision_id,
    $data,
    1
  )
ON CONFLICT (assessment_instance_id, shared_state_object_id) DO UPDATE
SET
  revision_id = EXCLUDED.revision_id,
  data = EXCLUDED.data,
  write_seq = assessment_instance_shared_state_values.write_seq + 1,
  updated_at = now()
RETURNING
  *;

-- BLOCK select_user_value
SELECT
  *
FROM
  user_shared_state_values
WHERE
  user_id = $user_id
  AND shared_state_object_id = $shared_state_object_id;

-- BLOCK select_user_value_for_update
SELECT
  *
FROM
  user_shared_state_values
WHERE
  user_id = $user_id
  AND shared_state_object_id = $shared_state_object_id
FOR UPDATE;

-- BLOCK upsert_user_value
INSERT INTO
  user_shared_state_values (
    user_id,
    shared_state_object_id,
    revision_id,
    data,
    write_seq
  )
VALUES
  (
    $user_id,
    $shared_state_object_id,
    $revision_id,
    $data,
    1
  )
ON CONFLICT (user_id, shared_state_object_id) DO UPDATE
SET
  revision_id = EXCLUDED.revision_id,
  data = EXCLUDED.data,
  write_seq = user_shared_state_values.write_seq + 1,
  updated_at = now()
RETURNING
  *;
