ALTER TABLE saml_providers
ADD COLUMN validate_audience boolean NOT NULL DEFAULT false;

ALTER TABLE saml_providers
ADD COLUMN want_assertions_signed boolean NOT NULL DEFAULT false;

ALTER TABLE saml_providers
ADD COLUMN want_authn_response_signed boolean NOT NULL DEFAULT false;
