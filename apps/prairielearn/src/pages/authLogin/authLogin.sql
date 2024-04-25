-- BLOCK select_supported_providers_for_institution
SELECT
  ap.name,
  i.id IS NOT NULL AS is_default
FROM
  institution_authn_providers AS iap
  JOIN authn_providers AS ap ON (iap.authn_provider_id = ap.id)
  LEFT JOIN institutions AS i ON (i.default_authn_provider_id = ap.id)
WHERE
  iap.institution_id = $institution_id;

-- BLOCK select_institution_authn_providers
SELECT
  i.id,
  i.long_name,
  i.short_name,
  ap.name AS default_authn_provider_name
FROM
  institutions AS i
  JOIN authn_providers AS ap ON ap.id = i.default_authn_provider_id
ORDER BY
  i.long_name ASC;
