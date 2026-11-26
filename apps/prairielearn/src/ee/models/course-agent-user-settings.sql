-- BLOCK select_course_agent_user_settings
SELECT
  *
FROM
  course_agent_user_settings
WHERE
  user_id = $user_id
  AND course_id = $course_id;

-- BLOCK upsert_course_agent_user_approval_mode
INSERT INTO
  course_agent_user_settings (user_id, course_id, approval_mode)
VALUES
  ($user_id, $course_id, $approval_mode)
ON CONFLICT (user_id, course_id) DO UPDATE
SET
  approval_mode = EXCLUDED.approval_mode
RETURNING
  *;

-- BLOCK upsert_course_agent_user_auto_approve_offered
INSERT INTO
  course_agent_user_settings (user_id, course_id, auto_approve_offered_at)
VALUES
  ($user_id, $course_id, now())
ON CONFLICT (user_id, course_id) DO UPDATE
SET
  auto_approve_offered_at = COALESCE(
    course_agent_user_settings.auto_approve_offered_at,
    EXCLUDED.auto_approve_offered_at
  )
RETURNING
  *;
