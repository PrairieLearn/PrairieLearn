-- Declare `assessments.tid` as `NOT NULL`; this column has always been mandatory.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE assessments
ADD CONSTRAINT assessments_tid_not_null CHECK (tid IS NOT NULL) NOT VALID;

ALTER TABLE assessments VALIDATE CONSTRAINT assessments_tid_not_null;

DO $$
BEGIN
  IF (SELECT convalidated FROM pg_constraint WHERE conname = 'assessments_tid_not_null') THEN
    ALTER TABLE assessments ALTER COLUMN tid SET NOT NULL;

    ALTER TABLE assessments DROP CONSTRAINT assessments_tid_not_null;
  ELSE
    ALTER TABLE assessments DROP CONSTRAINT assessments_tid_not_null;

    RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
  END IF;
END;
$$;
