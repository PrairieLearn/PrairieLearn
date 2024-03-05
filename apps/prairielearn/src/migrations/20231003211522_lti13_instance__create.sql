INSERT INTO
  authn_providers
VALUES
  (6, 'LTI 1.3')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS lti13_instances (
  access_token_expires_at timestamptz,
  access_tokenset jsonb,
  client_params jsonb,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  id bigserial PRIMARY KEY,
  institution_id BIGINT NOT NULL REFERENCES institutions ON UPDATE CASCADE ON DELETE SET NULL,
  issuer_params jsonb DEFAULT '{}'::jsonb,
  keystore jsonb,
  name text NOT NULL DEFAULT 'LMS',
  name_attribute text,
  platform text NOT NULL DEFAULT 'Unknown',
  tool_platform_name text,
  uid_attribute text,
  uin_attribute text
);

CREATE INDEX IF NOT EXISTS lti13_instances_institution_id_idx ON lti13_instances (institution_id);
