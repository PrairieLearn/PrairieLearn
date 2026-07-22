DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM enrollments
    WHERE lti_managed
  ) THEN
    RAISE EXCEPTION 'Unexpected lti_managed enrollments exist; refusing to drop the column';
  END IF;
END
$$;

ALTER TABLE enrollments
DROP COLUMN lti_managed;
