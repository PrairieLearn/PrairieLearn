-- BLOCK select_institution
SELECT * FROM institutions WHERE id = $id;

-- BLOCK insert_institution_saml_provider
WITH existing_saml_provider AS (
  SELECT * FROM saml_providers WHERE institution_id = $institution_id
), upserted_saml_provider AS (
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
    private_key = COALESCE($private_key, saml_providers.private_key)
  RETURNING *
), audit_logs_upserted_saml_provider AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state,
    new_state
  ) SELECT
    $authn_user_id as authn_user_id,
    'saml_providers' as table_name,
    (CASE WHEN esp.id IS NULL THEN 'insert' ELSE 'update' END) as action,
    $institution_id as institution_id,
    usp.id AS row_id,
    (to_jsonb(esp) || jsonb_build_object('private_key', 'REDACTED')) AS old_state,
    json_build_object(
      'id', usp.id,
      'sso_login_url', usp.sso_login_url,
      'issuer', usp.issuer,
      'certificate', usp.certificate,
      'uid_attribute', usp.uid_attribute,
      'uin_attribute', usp.uin_attribute,
      'name_attribute', usp.name_attribute,
      'public_key', usp.public_key,
      'private_key', 'REDACTED' 
    ) AS new_state
  FROM upserted_saml_provider AS usp
    LEFT JOIN existing_saml_provider AS esp ON TRUE
) SELECT 1;

-- BLOCK delete_institution_saml_provider
WITH deleted_authn_provider AS (
  DELETE FROM institution_authn_providers
  USING authn_providers AS ap
  WHERE
    ap.name = 'SAML'
    AND authn_provider_id = ap.id
    AND institution_id = $institution_id
  RETURNING institution_authn_providers.*
), deleted_saml_provider AS (
  DELETE FROM saml_providers
  WHERE institution_id = $institution_id
  RETURNING *
), audit_logs_deleted_authn_provider AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state
  ) SELECT
    $authn_user_id as authn_user_id,
    'institution_authn_providers' as table_name,
    'delete' as action,
    $institution_id as institution_id,
    dap.id as row_id,
    to_jsonb(dap) AS old_state
  FROM deleted_authn_provider AS dap
), audit_logs_deleted_saml_provider AS (
  INSERT INTO audit_logs (
    authn_user_id,
    table_name,
    action,
    institution_id,
    row_id,
    old_state
  ) SELECT
    $authn_user_id as authn_user_id,
    'saml_providers' as table_name,
    'delete' as action,
    $institution_id as institution_id,
    dsp.id as row_id,
    (to_jsonb(dsp) || jsonb_build_object('private_key', 'REDACTED')) AS old_state
  FROM deleted_saml_provider AS dsp
) SELECT 1;
