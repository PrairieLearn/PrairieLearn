-- BLOCK select_instances
SELECT
  *
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND deleted_at IS NULL
ORDER BY
  id;

-- BLOCK select_keystore
SELECT
  keystore
FROM
  lti13_instances
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_keystore
UPDATE lti13_instances
SET
  keystore = $keystore::jsonb
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_platform
UPDATE lti13_instances
SET
  (
    platform,
    issuer_params,
    client_params,
    custom_fields
  ) = (
    $platform,
    $issuer_params,
    $client_params,
    $custom_fields
  )
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK insert_instance
INSERT INTO
  lti13_instances (
    institution_id,
    name_attribute,
    uid_attribute,
    uin_attribute,
    email_attribute
  )
VALUES
  (
    $institution_id,
    $name_attr,
    $uid_attr,
    $uin_attr,
    $email_attr
  )
RETURNING
  id;

-- BLOCK update_name
UPDATE lti13_instances
SET
  name = $name
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK update_pl_config
UPDATE lti13_instances
SET
  name_attribute = $name_attribute,
  uid_attribute = $uid_attribute,
  uin_attribute = $uin_attribute,
  email_attribute = $email_attribute
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK remove_instance
UPDATE lti13_instances
SET
  deleted_at = now()
WHERE
  institution_id = $institution_id
  AND id = $unsafe_lti13_instance_id
  AND deleted_at IS NULL;
