-- prairielearn:migrations NO TRANSACTION
--
-- Declare `variants.authn_user_id` as NOT NULL; it was always required.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE variants
DROP CONSTRAINT IF EXISTS variants_authn_user_id_not_null;

ALTER TABLE variants
ADD CONSTRAINT variants_authn_user_id_not_null CHECK (authn_user_id IS NOT NULL) NOT VALID;

ALTER TABLE variants VALIDATE CONSTRAINT variants_authn_user_id_not_null;

DO $$
BEGIN
    IF (SELECT convalidated FROM pg_constraint WHERE conname = 'variants_authn_user_id_not_null') THEN
        ALTER TABLE variants
        ALTER COLUMN authn_user_id
        SET NOT NULL;

        ALTER TABLE variants
        DROP CONSTRAINT variants_authn_user_id_not_null;
    ELSE
        ALTER TABLE variants
        DROP CONSTRAINT variants_authn_user_id_not_null;

        RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
    END IF;
END;
$$;
