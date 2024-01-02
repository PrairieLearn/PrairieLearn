CREATE TABLE IF NOT EXISTS saml_providers (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  sso_login_url TEXT NOT NULL,
  issuer TEXT NOT NULL,
  certificate TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  uid_attribute TEXT,
  uin_attribute TEXT,
  name_attribute TEXT,
  -- Only allow one SAML provider per institution.
  UNIQUE (institution_id)
);

INSERT INTO
  authn_providers (id, name)
VALUES
  (5, 'SAML')
ON CONFLICT DO NOTHING;
