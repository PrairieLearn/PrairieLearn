-- Completes the work started in `20250213014138_variants__authn_user_id__nonnull_constraint_add`.
-- This is done in a separate migration because we were running into issues with a table
-- lock being held for too long when the constraint was created and validated in the same query.
ALTER TABLE variants VALIDATE CONSTRAINT variants_authn_user_id_not_null;

ALTER TABLE variants
ALTER COLUMN authn_user_id
SET NOT NULL;

ALTER TABLE variants
DROP CONSTRAINT variants_authn_user_id_not_null;
