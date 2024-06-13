-- Declare `questions.qid` as `NOT NULL`; this column has always been mandatory.
-- Use the approach described here to avoid a long table lock:
-- https://dba.stackexchange.com/questions/267947/how-can-i-set-a-column-to-not-null-without-locking-the-table-during-a-table-scan/268128#268128
ALTER TABLE questions
ADD CONSTRAINT questions_qid_not_null CHECK (qid IS NOT NULL) NOT VALID;

ALTER TABLE questions VALIDATE CONSTRAINT questions_qid_not_null;

DO $$
BEGIN
  IF (SELECT convalidated FROM pg_constraint WHERE conname = 'questions_qid_not_null') THEN
    ALTER TABLE questions ALTER COLUMN qid SET NOT NULL;

    ALTER TABLE questions DROP CONSTRAINT questions_qid_not_null;
  ELSE
    ALTER TABLE questions DROP CONSTRAINT questions_qid_not_null;

    RAISE EXCEPTION 'NULL row(s) exist in column, unable to add NOT NULL constraint';
  END IF;
END;
$$;
