-- BLOCK configure_institution_saml_for_lti_uin
WITH
  upserted_saml_provider AS (
    INSERT INTO
      saml_providers (
        institution_id,
        sso_login_url,
        issuer,
        certificate,
        uid_attribute,
        uin_attribute,
        name_attribute,
        public_key,
        private_key
      )
    VALUES
      (
        $institution_id,
        'https://example.com/saml/login',
        'https://example.com/saml',
        'test certificate',
        'uid',
        'uin',
        'name',
        'test public key',
        'test private key'
      )
    ON CONFLICT (institution_id) DO UPDATE
    SET
      uin_attribute = EXCLUDED.uin_attribute
  ),
  deleted_institutional_providers AS (
    DELETE FROM institution_authn_providers AS iap USING authn_providers AS ap
    WHERE
      iap.authn_provider_id = ap.id
      AND iap.institution_id = $institution_id
      AND ap.name IN ('Shibboleth', 'Google', 'Azure')
  )
INSERT INTO
  institution_authn_providers (institution_id, authn_provider_id)
SELECT
  $institution_id,
  id
FROM
  authn_providers
WHERE
  name = 'SAML'
ON CONFLICT DO NOTHING;
