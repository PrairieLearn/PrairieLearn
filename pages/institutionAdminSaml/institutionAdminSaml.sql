-- BLOCK select_institution
SELECT * FROM institutions WHERE id = $id;

-- BLOCK select_institution_saml_provider
SELECT * FROM saml_providers WHERE institution_id = $institution_id;

-- BLOCK insert_institution_saml_provider
INSERT INTO saml_providers (
  institution_id,
  sso_login_url,
  issuer,
  certificate,
  public_key,
  private_key
) VALUES (
  $institution_id,
  $sso_login_url,
  $issuer,
  $certificate,
  $public_key,
  $private_key
) ON CONFLICT (institution_id) DO UPDATE
SET
  sso_login_url = EXCLUDED.sso_login_url,
  issuer = EXCLUDED.issuer,
  certificate = EXCLUDED.certificate,
  public_key = COALESCE(EXCLUDED.public_key, saml_providers.public_key),
  private_key = COALESCE(EXCLUDED.private_key, saml_providers.private_key);

-- BLOCK delete_institution_saml_provider
DELETE FROM saml_providers WHERE institution_id = $institution_id;
