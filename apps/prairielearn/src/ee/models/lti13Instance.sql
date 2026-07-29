-- BLOCK select_lti13_instance
SELECT
  *
FROM
  lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_lti13_instance_for_update
SELECT
  *
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL
FOR UPDATE;

-- BLOCK select_lti13_instances_with_roster_sync_allowed
SELECT
  *
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND roster_sync_allowed
  AND deleted_at IS NULL
ORDER BY
  id;
