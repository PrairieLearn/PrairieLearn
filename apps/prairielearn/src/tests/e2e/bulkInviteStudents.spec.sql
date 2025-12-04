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

-- BLOCK insert_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, 1, $status, NOW())
ON CONFLICT DO NOTHING;

-- BLOCK enable_modern_publishing
UPDATE course_instances
SET
  modern_publishing = TRUE
WHERE
  id = 1;

-- BLOCK enable_enrollment_management_feature
INSERT INTO
  feature_grants (feature, institution_id)
VALUES
  ('enrollment-management', '1')
ON CONFLICT DO NOTHING;

-- BLOCK set_dev_user_as_admin
UPDATE users
SET
  is_administrator = TRUE
WHERE
  uid = 'dev@example.com';
