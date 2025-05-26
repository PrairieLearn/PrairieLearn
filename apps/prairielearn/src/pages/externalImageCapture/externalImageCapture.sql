-- BLOCK insert_new_external_image_capture
INSERT INTO 
    external_image_captures (
        authn_user_id,
        created_at,
        deleted_at,
        instance_question_id,
        element_uuid
    )
VALUES (
    $authn_user_id,
    NOW(),
    NULL,
    $instance_question_id,
    $element_uuid
);

-- BLOCK select_external_image_capture_exists
SELECT
  EXISTS (
    SELECT 1
    FROM external_image_captures AS eic
    WHERE
      eic.authn_user_id = $authn_user_id AND
      eic.instance_question_id = $instance_question_id AND
      eic.element_uuid = $element_uuid AND
      eic.deleted_at IS NULL
  )

-- BLOCK select_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.id = $instance_question_id;