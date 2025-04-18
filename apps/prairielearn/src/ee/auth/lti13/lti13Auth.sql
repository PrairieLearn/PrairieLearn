-- BLOCK verify_upsert
UPDATE lti13_instances
SET
  tool_platform_name = $tool_platform_name
WHERE
  id = $lti13_instance_id;
