-- BLOCK select_institution_authn_providers
SELECT
  iap.*,
  ap.name,
  i.id IS NOT NULL AS is_default
FROM
  institution_authn_providers AS iap
  JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
  LEFT JOIN institutions AS i ON (i.default_authn_provider_id = ap.id)
WHERE institution_id = $institution_id;
