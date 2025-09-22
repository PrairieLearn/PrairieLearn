ALTER TABLE enrollments
ADD CONSTRAINT first_joined_at_not_null_if_joined_and_created_at_not_null CHECK (
  -- Old enrollments have a null created_at. Don't enforce the constraint for those.
  created_at IS NULL
  -- If the status is 'invited', 'lti13_pending', or 'rejected', then the first_joined_at may or may not be null.
  -- Don't enforce the constraint for those.
  OR status IN ('invited', 'lti13_pending', 'rejected')
  -- Enforce that if the status is 'joined', 'removed', or 'rejected', then the first_joined_at is not null.
  -- You can only be removed or rejected if you were joined at some point.
  OR first_joined_at IS NOT NULL
) NOT VALID;
