-- BLOCK insert_joined_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, 1, 'joined', NOW())
ON CONFLICT DO NOTHING;

-- BLOCK insert_invited_enrollment
INSERT INTO
  enrollments (course_instance_id, status, pending_uid)
VALUES
  (1, 'invited', $pending_uid)
ON CONFLICT DO NOTHING;

-- BLOCK enable_modern_publishing
UPDATE course_instances
SET
  modern_publishing = TRUE
WHERE
  id = 1;
