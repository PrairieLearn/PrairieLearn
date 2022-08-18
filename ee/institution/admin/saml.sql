-- BLOCK select_institution
SELECT * FROM institutions WHERE id = $id;

-- BLOCK insert_institution_saml_provider
INSERT INTO saml_providers (
  institution_id,
  sso_login_url,
  issuer,
  certificate,
  uid_attribute,
  uin_attribute,
  name_attribute,
  public_key,
  private_key
) VALUES (
  $institution_id,
  $sso_login_url,
  $issuer,
  $certificate,
  $uid_attribute,
  $uin_attribute,
  $name_attribute,
  COALESCE($public_key, ''),
  COALESCE($private_key, '')
) ON CONFLICT (institution_id) DO UPDATE
SET
  sso_login_url = EXCLUDED.sso_login_url,
  issuer = EXCLUDED.issuer,
  certificate = EXCLUDED.certificate,
  uid_attribute = EXCLUDED.uid_attribute,
  uin_attribute = EXCLUDED.uin_attribute,
  name_attribute = EXCLUDED.name_attribute,
  public_key = COALESCE($public_key, saml_providers.public_key),
  private_key = COALESCE($private_key, saml_providers.private_key);

-- BLOCK delete_institution_saml_provider
WITH deleted_authn_provider AS (
  DELETE FROM institution_authn_providers
  USING authn_providers AS ap
  WHERE
    ap.name = 'SAML'
    and authn_provider_id = ap.id
), deleted_saml_provider AS (
  DELETE FROM saml_providers
  WHERE institution_id = $institution_id
), audit_logs_deleted_authn_provider AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state
  ) SELECT ...
), audit_logs_deleted_saml_provider (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state
  ) SELECT ...
) SELECT 1;
