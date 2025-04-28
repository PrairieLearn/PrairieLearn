-- BLOCK verify_upsert
UPDATE lti13_instances
SET
  tool_platform_name = $tool_platform_name
WHERE
  id = $lti13_instance_id;

-- BLOCK select_user_by_uid_and_institution
SELECT
  *
FROM
  users
WHERE
  uid = $uid
  AND institution_id = $institution_id
  AND deleted_at IS NULL;
