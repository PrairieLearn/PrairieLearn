-- BLOCK select_instances
SELECT
  *
FROM
  pl_lti13_instances
WHERE
  institution_id = $institution_id
  AND deleted_at IS NULL
ORDER BY
  id;

-- BLOCK select_defaults
SELECT
  platform,
  issuer_params
FROM
  pl_lti13_platform_defaults
ORDER BY
  display_order,
  platform;

-- BLOCK select_keystore
SELECT
  keystore
FROM
  pl_lti13_instances
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_keystore
UPDATE pl_lti13_instances
SET
  keystore = $keystore::jsonb
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_platform
UPDATE pl_lti13_instances
SET
  (platform, issuer_params, client_params) = ($platform, $issuer_params, $client_params)
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK insert_instance
INSERT INTO
  pl_lti13_instances (
    institution_id,
    name_attribute,
    uid_attribute,
    uin_attribute
  )
VALUES
  ($institution_id, $name_attr, $uid_attr, $uin_attr)
RETURNING
  id;

-- BLOCK update_name
UPDATE pl_lti13_instances
SET
  name = $name
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_pl_config
UPDATE pl_lti13_instances
SET
  name_attribute = $name_attribute,
  uid_attribute = $uid_attribute,
  uin_attribute = $uin_attribute
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK remove_instance
UPDATE pl_lti13_instances
SET
  deleted_at = now()
WHERE
  institution_id = $institution_id
  AND id = $lti13_instance_id
  AND deleted_at IS NULL;
