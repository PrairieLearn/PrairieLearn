ALTER TABLE submissions
DROP COLUMN type;

-- temporarily drop this function so we can drop the type
DROP FUNCTION IF EXISTS submissions_insert (
  bigint,
  bigint,
  jsonb,
  enum_submission_type,
  integer,
  enum_mode,
  bigint
);

DROP TYPE enum_submission_type;
