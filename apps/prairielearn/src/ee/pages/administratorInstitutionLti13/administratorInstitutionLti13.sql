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

-- BLOCK select_linked_course_instances
SELECT
  to_jsonb(lci) AS lti13_course_instance,
  ci.short_name AS course_instance_short_name,
  c.short_name AS course_short_name,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object(
            'resource_link_id',
            la.lineitem ->> 'resourceLinkId',
            'label',
            la.lineitem ->> 'label',
            'assessment_title',
            a.title
          )
          ORDER BY
            la.id
        )
      FROM
        lti13_assessments AS la
        JOIN assessments AS a ON a.id = la.assessment_id
      WHERE
        la.lti13_course_instance_id = lci.id
        AND la.lineitem ->> 'resourceLinkId' IS NOT NULL
    ),
    '[]'::jsonb
  ) AS lineitem_resource_links
FROM
  lti13_course_instances AS lci
  JOIN course_instances AS ci ON ci.id = lci.course_instance_id
  JOIN courses AS c ON c.id = ci.course_id
WHERE
  lci.lti13_instance_id = $lti13_instance_id
ORDER BY
  lci.id;

-- BLOCK select_combined_lti13_instance
SELECT
  to_jsonb(lci) AS lti13_course_instance,
  to_jsonb(li) AS lti13_instance
FROM
  lti13_course_instances AS lci
  JOIN lti13_instances AS li ON li.id = lci.lti13_instance_id
WHERE
  lci.id = $lti13_course_instance_id
  AND li.id = $lti13_instance_id
  AND li.institution_id = $institution_id
  AND li.deleted_at IS NULL;

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
    email_attribute,
    require_linked_lti_user
  )
VALUES
  (
    $institution_id,
    $name_attr,
    $uid_attr,
    $uin_attr,
    $email_attr,
    $require_linked_lti_user
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
  email_attribute = $email_attribute,
  require_linked_lti_user = $require_linked_lti_user
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
