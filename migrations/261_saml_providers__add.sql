CREATE TABLE IF NOT EXISTS saml_providers (
  id BIGSERIAL PRIMARY KEY,
  institution_id BIGINT REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  sso_login_url TEXT NOT NULL,
  issuer TEXT NOT NULL,
  certificate TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  -- Only allow one SAML provider per institution.
  UNIQUE (institution_id)
)
