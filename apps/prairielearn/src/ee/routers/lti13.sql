-- BLOCK get_instances
SELECT
  *
FROM
  pl_lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;
