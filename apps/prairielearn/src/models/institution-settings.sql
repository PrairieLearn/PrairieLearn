-- BLOCK select_institution_settings
SELECT
  *
FROM
  institution_settings
WHERE
  institution_id = $institution_id;

-- BLOCK select_institution_settings_for_update
SELECT
  *
FROM
  institution_settings
WHERE
  institution_id = $institution_id
FOR UPDATE;

-- BLOCK upsert_institution_settings
INSERT INTO
  institution_settings (institution_id, course_request_message)
VALUES
  ($institution_id, $course_request_message)
ON CONFLICT (institution_id) DO UPDATE
SET
  course_request_message = EXCLUDED.course_request_message
RETURNING
  institution_settings.*;
