-- BLOCK select_course_agent_user_settings
SELECT
  *
FROM
  course_agent_user_settings
WHERE
  user_id = $user_id
  AND course_id = $course_id;

-- BLOCK upsert_course_agent_user_default_approval_mode
INSERT INTO
  course_agent_user_settings (user_id, course_id, default_approval_mode)
VALUES
  ($user_id, $course_id, $default_approval_mode)
ON CONFLICT (user_id, course_id) DO UPDATE
SET
  default_approval_mode = EXCLUDED.default_approval_mode
RETURNING
  *;
