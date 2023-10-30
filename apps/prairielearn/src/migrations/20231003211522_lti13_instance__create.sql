INSERT INTO
  authn_providers
VALUES
  (6, 'LTI 1.3')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS
  lti13_instances (
    id bigserial PRIMARY KEY,
    institution_id BIGINT NOT NULL REFERENCES institutions ON UPDATE CASCADE ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT current_timestamp,
    deleted_at timestamptz,
    platform text NOT NULL DEFAULT 'Unknown',
    name text NOT NULL DEFAULT 'LMS',
    tool_platform_name text,
    keystore jsonb,
    issuer_params jsonb DEFAULT '{}'::jsonb,
    client_params jsonb,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    uid_attribute text,
    uin_attribute text,
    name_attribute text,
    access_tokenset jsonb,
    access_token_expires_at timestamptz
  );

CREATE INDEX IF NOT EXISTS lti13_instances_institution_id_idx ON lti13_instances (institution_id);
