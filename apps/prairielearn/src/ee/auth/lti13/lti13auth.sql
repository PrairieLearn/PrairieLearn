-- BLOCK verify_upsert
UPDATE lti13_instances
SET
  tool_platform_name = $tool_platform_name
WHERE
  id = $lti13_instance_id;

-- BLOCK get_course_instance
SELECT
  *
FROM
  lti13_course_instances AS lci
WHERE
  lti13_instance_id = $instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id
  AND deleted_at IS NULL
LIMIT
  1;

-- BLOCK update_lti13_users
INSERT INTO
  lti13_users (user_id, pl_lti13_instance_id, sub)
VALUES
  ($user_id, $pl_lti13_instance_id, $sub)
ON CONFLICT (user_id, pl_lti13_instance_id) DO
UPDATE
SET
  sub = $sub;
