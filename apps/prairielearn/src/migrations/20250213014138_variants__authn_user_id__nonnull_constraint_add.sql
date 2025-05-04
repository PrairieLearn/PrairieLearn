ALTER TABLE variants
DROP CONSTRAINT IF EXISTS variants_authn_user_id_not_null;

ALTER TABLE variants
ADD CONSTRAINT variants_authn_user_id_not_null CHECK (authn_user_id IS NOT NULL) NOT VALID;
