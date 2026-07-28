-- BLOCK select_lti13_roster_sync_readiness
SELECT
  i.id AS institution_id,
  i.short_name AS institution_short_name,
  i.long_name AS institution_long_name,
  li.id AS lti13_instance_id,
  li.name AS lti13_instance_name,
  li.platform,
  NULLIF(btrim(li.uin_attribute), '') AS lti13_uin_attribute,
  NULLIF(btrim(sp.uin_attribute), '') AS saml_uin_attribute,
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
  (
    SELECT
      count(*)
    FROM
      lti13_instances AS institution_li
    WHERE
      institution_li.institution_id = i.id
      AND institution_li.deleted_at IS NULL
      AND NULLIF(btrim(institution_li.uin_attribute), '') IS NULL
  ) AS active_lti13_instances_without_uin_count,
  (
    SELECT
      count(*)
    FROM
      users AS u
    WHERE
      u.institution_id = i.id
      AND NULLIF(btrim(u.uin), '') IS NULL
  ) AS users_without_uin_count
FROM
  lti13_instances AS li
  JOIN institutions AS i ON (i.id = li.institution_id)
  LEFT JOIN saml_providers AS sp ON (sp.institution_id = i.id)
WHERE
  li.deleted_at IS NULL
ORDER BY
  i.short_name,
  i.id,
  li.id;
