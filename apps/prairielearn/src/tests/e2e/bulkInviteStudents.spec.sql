-- BLOCK insert_or_update_user
INSERT INTO
  users (uid, name, uin)
VALUES
  ($uid, $name, $uid)
ON CONFLICT (uid) DO UPDATE
SET
  name = EXCLUDED.name
RETURNING
  user_id;

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

-- BLOCK enable_enrollment_management_feature
INSERT INTO
  feature_grants (name, institution_id)
VALUES
  ('enrollment-management', '1')
ON CONFLICT DO NOTHING;

-- BLOCK set_dev_user_as_admin
INSERT INTO
  administrators (user_id)
SELECT
  user_id
FROM
  users
WHERE
  uid = 'dev@example.com'
ON CONFLICT DO NOTHING;
