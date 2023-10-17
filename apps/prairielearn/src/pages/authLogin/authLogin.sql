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
