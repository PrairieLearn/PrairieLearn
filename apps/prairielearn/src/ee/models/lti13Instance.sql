-- BLOCK select_lti13_instance
SELECT
  *
FROM
  lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_lti13_instances_with_configured_uin
SELECT
  *
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND NULLIF(btrim(uin_attribute), '') IS NOT NULL
  AND deleted_at IS NULL
ORDER BY
  id;
