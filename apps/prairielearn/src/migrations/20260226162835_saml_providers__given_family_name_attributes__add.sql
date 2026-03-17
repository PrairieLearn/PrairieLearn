ALTER TABLE saml_providers
ADD COLUMN given_name_attribute TEXT;

ALTER TABLE saml_providers
ADD COLUMN family_name_attribute TEXT;
