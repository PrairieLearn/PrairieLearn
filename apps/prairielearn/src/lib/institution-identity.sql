-- BLOCK lock_institution
SELECT
  id
FROM
  institutions
WHERE
  id = $institution_id
FOR UPDATE;

-- BLOCK select_identity_configuration_status
SELECT
  (
    SELECT
      NULLIF(btrim(sp.uin_attribute), '')
    FROM
      saml_providers AS sp
    WHERE
      sp.institution_id = i.id
  ) AS saml_uin_attribute,
  COALESCE(
    (
      SELECT
        array_agg(
          ap.name
          ORDER BY
            ap.id
        )
      FROM
        institution_authn_providers AS iap
        JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
      WHERE
        iap.institution_id = i.id
    ),
    ARRAY[]::text[]
  ) AS enabled_authn_provider_names,
  EXISTS (
    SELECT
      1
    FROM
      lti13_instances AS li
    WHERE
      li.institution_id = i.id
      AND li.deleted_at IS NULL
      AND li.roster_sync_permitted
  ) AS has_roster_sync_permitted_lti13_instance
FROM
  institutions AS i
WHERE
  i.id = $institution_id;

-- BLOCK select_authn_provider_names
SELECT
  name
FROM
  authn_providers
WHERE
  id = ANY ($authn_provider_ids::bigint[])
ORDER BY
  id;
