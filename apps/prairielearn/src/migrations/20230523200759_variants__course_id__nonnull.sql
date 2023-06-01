-- declare the new course_id column of the variants table to be not null
-- using the approach suggested by a postgres dev here: https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
-- to avoid a long table lock
ALTER TABLE variants
ADD CONSTRAINT variants_course_id_not_null CHECK (course_id IS NOT NULL) NOT VALID;

ALTER TABLE variants VALIDATE CONSTRAINT variants_course_id_not_null;

DO $$
BEGIN
    IF (SELECT convalidated FROM pg_constraint WHERE conname = 'variants_course_id_not_null') THEN
        ALTER TABLE variants
        ALTER COLUMN course_id
        SET NOT NULL;

        ALTER TABLE variants
        DROP CONSTRAINT variants_course_id_not_null;
    ELSE
        ALTER TABLE variants
        DROP CONSTRAINT variants_course_id_not_null;

        RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
    END IF;
END;
$$;
