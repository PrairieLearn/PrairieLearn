-- BLOCK select_institution
SELECT
  *
FROM
  institutions
WHERE
  id = $id;

-- BLOCK select_institution_saml_provider
SELECT
  *
FROM
  saml_providers
WHERE
  institution_id = $institution_id;

-- BLOCK select_authentication_providers
SELECT
  *
FROM
  authn_providers;

-- BLOCK select_institution_authn_providers
SELECt
  ap.*
FROM
  authn_providers AS ap
  JOIN institution_authn_providers AS iap ON (iap.authn_provider_id = ap.id)
  JOIN institutions AS i ON (i.id = iap.institution_id)
WHERE
  i.id = $institution_id;
