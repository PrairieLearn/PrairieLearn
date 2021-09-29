ALTER TABLE questions ADD COLUMN external_grading_environment text[] DEFAULT ARRAY[]::text[];
