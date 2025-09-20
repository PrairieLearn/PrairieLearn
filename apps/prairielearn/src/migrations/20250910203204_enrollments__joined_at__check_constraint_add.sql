ALTER TABLE enrollments
ADD CONSTRAINT joined_at_not_null_if_joined_and_created_at_not_null CHECK (
  -- old enrollments have a null created_at. Don't enforce the constraint for those.
  created_at IS NULL
  -- Enforce that if the status is 'joined', then the joined_at is not null.
  OR joined_at IS NOT NULL
  OR status != 'joined'
) NOT VALID;
