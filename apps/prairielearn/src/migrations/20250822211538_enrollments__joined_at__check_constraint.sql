ALTER TABLE enrollments
ADD CONSTRAINT joined_at_not_null_if_joined CHECK (
  joined_at IS NOT NULL
  OR status != 'joined'
);
