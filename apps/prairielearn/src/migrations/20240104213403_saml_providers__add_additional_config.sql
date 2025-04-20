-- Create the columns with `false` default values so that existing providers
-- retain the previous behavior.
ALTER TABLE saml_providers
ADD COLUMN IF NOT EXISTS validate_audience boolean NOT NULL DEFAULT false;

ALTER TABLE saml_providers
ADD COLUMN IF NOT EXISTS want_assertions_signed boolean NOT NULL DEFAULT false;

ALTER TABLE saml_providers
ADD COLUMN IF NOT EXISTS want_authn_response_signed boolean NOT NULL DEFAULT false;

-- Update the column defaults so that any newly-created providers have the
-- new behavior.
ALTER TABLE saml_providers
ALTER COLUMN validate_audience
SET DEFAULT true;

ALTER TABLE saml_providers
ALTER COLUMN want_assertions_signed
SET DEFAULT true;

ALTER TABLE saml_providers
ALTER COLUMN want_authn_response_signed
SET DEFAULT true;
