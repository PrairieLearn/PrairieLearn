-- BLOCK select_institution_saml_providers
SELECT
  i.id,
  i.long_name
FROM
  institutions AS i
  JOIN saml_providers AS sp ON (sp.institution_id = i.id);
