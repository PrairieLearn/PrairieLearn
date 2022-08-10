ALTER TABLE saml_providers ADD COLUMN IF NOT EXISTS uid_attribute TEXT;
ALTER TABLE saml_providers ADD COLUMN IF NOT EXISTS uin_attribute TEXT;
ALTER TABLE saml_providers ADD COLUMN IF NOT EXISTS name_attribute TEXT;
