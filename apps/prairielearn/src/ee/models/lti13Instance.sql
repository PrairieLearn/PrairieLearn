-- BLOCK select_lti13_instance
SELECT
  *
FROM
  lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_lti13_instances_with_roster_sync_permitted
SELECT
  *
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND roster_sync_permitted
  AND deleted_at IS NULL
ORDER BY
  id;
