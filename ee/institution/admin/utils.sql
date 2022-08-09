-- BLOCK select_institution
SELECT * FROM institutions WHERE id = $id;

-- BLOCK select_institution_saml_provider
SELECT * FROM saml_providers WHERE institution_id = $institution_id;
