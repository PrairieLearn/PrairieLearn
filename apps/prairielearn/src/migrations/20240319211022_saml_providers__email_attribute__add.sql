ALTER TABLE saml_providers
ADD COLUMN IF NOT EXISTS email_attribute TEXT;
