-- prairielearn:migrations NO TRANSACTION
--
-- Declare `variants.variant_seed` as NOT NULL; it was always required.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE variants
DROP CONSTRAINT IF EXISTS variants_variant_seed_not_null;

ALTER TABLE variants
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT variants_variant_seed_not_null CHECK (variant_seed IS NOT NULL) NOT VALID;

-- squawk-ignore constraint-missing-not-valid
ALTER TABLE variants VALIDATE CONSTRAINT variants_variant_seed_not_null;

DO $$
BEGIN
    IF (SELECT convalidated FROM pg_constraint WHERE conname = 'variants_variant_seed_not_null') THEN
        ALTER TABLE variants
        ALTER COLUMN variant_seed
        SET NOT NULL;

        ALTER TABLE variants
        DROP CONSTRAINT variants_variant_seed_not_null;
    ELSE
        ALTER TABLE variants
        DROP CONSTRAINT variants_variant_seed_not_null;

        RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
    END IF;
END;
$$;
