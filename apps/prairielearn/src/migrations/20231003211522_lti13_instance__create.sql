-- Don't hard code authn_provider.id?
INSERT INTO
  authn_providers
VALUES
  (6, 'LTI 1.3')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS
  pl_lti13_instances (
    id bigserial PRIMARY KEY,
    institution_id BIGINT REFERENCES institutions ON DELETE CASCADE ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    deleted_at timestamptz,
    platform text,
    name text,
    tool_platform_name text,
    keystore jsonb,
    issuer_params jsonb,
    client_params jsonb,
    custom_params jsonb,
    uid_attribute text,
    uin_attribute text,
    name_attribute text,
    access_tokenset jsonb,
    access_token_expires_at timestamptz
  );

CREATE TABLE IF NOT EXISTS
  pl_lti13_platform_defaults (
    id bigserial PRIMARY KEY,
    platform text NOT NULL DEFAULT 'Unknown',
    issuer_params jsonb,
    client_params jsonb,
    custom_params jsonb,
    display_order integer
  );

INSERT INTO
  pl_lti13_platform_defaults (
    platform,
    issuer_params,
    client_params,
    display_order
  )
VALUES
  ('Unknown', null, null, 0),
  (
    'Canvas Production',
    '{
   "issuer": "https://canvas.instructure.com",
   "jwks_uri": "https://sso.canvaslms.com/api/lti/security/jwks",
   "token_endpoint": "https://sso.canvaslms.com/login/oauth2/token",
   "authorization_endpoint": "https://sso.canvaslms.com/api/lti/authorize_redirect"
}',
    '{
   "client_id": "10000000000001",
   "redirect_uris": [
      "https://pl.tbkenny.com/pl/lti13_instance/1/auth/callback"
   ],
   "token_endpoint_auth_method": "private_key_jwt",
   "token_endpoint_auth_signing_alg": "RS256"
}',
    10
  );
