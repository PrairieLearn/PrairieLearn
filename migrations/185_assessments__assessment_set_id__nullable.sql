ALTER TABLE assessments ALTER COLUMN assessment_set_id DROP NOT NULL;
-- This will verify that any non-deleted assessments have a valid assessment set ID
-- NOTE: This is potentially very expensive, as all rows will be checked.
-- Keep this in mind when deploying.
ALTER TABLE assessments ADD CONSTRAINT assessment_set_id_check CHECK (
  deleted_at IS NOT NULL
  OR (deleted_at IS NULL AND assessment_set_id IS NOT NULL)
);
