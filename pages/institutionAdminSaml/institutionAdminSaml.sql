-- BLOCK select_institution
SELECT * FROM institutions WHERE id = $id;

-- BLOCK select_institution_saml_provider
SELECT * FROM saml_providers WHERE institution_id = $institution_id;

-- BLOCK insert_institution_saml_provider
INSERT INTO saml_providers (
  institution_id,
  sso_login_url
) VALUES (
  $institution_id,
  $sso_login_url
) ON CONFLICT (institution_id) DO UPDATE SET sso_login_url = $sso_login_url;

-- BLOCK delete_institution_saml_provider
DELETE FROM saml_providers WHERE institution_id = $institution_id;
