-- BLOCK select_institution_settings
SELECT
  *
FROM
  institution_settings
WHERE
  institution_id = $institution_id;

-- BLOCK lock_institution
SELECT
  id
FROM
  institutions
WHERE
  id = $institution_id
FOR UPDATE;

-- BLOCK upsert_course_request_message
INSERT INTO
  institution_settings (institution_id, course_request_message)
VALUES
  ($institution_id, $value)
ON CONFLICT (institution_id) DO UPDATE
SET
  course_request_message = EXCLUDED.course_request_message
RETURNING
  institution_settings.*;

-- BLOCK upsert_github_course_owner
INSERT INTO
  institution_settings (institution_id, github_course_owner)
VALUES
  ($institution_id, $value)
ON CONFLICT (institution_id) DO UPDATE
SET
  github_course_owner = EXCLUDED.github_course_owner
RETURNING
  institution_settings.*;
