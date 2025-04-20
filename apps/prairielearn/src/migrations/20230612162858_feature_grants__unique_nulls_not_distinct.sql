-- Remove any duplicate rows that might exist.
DELETE FROM feature_grants AS fg USING feature_grants AS fg_duplicates
WHERE
  fg.id > fg_duplicates.id
  AND fg.name IS NOT DISTINCT FROM fg_duplicates.name
  AND fg.institution_id IS NOT DISTINCT FROM fg_duplicates.institution_id
  AND fg.course_id IS NOT DISTINCT FROM fg_duplicates.course_id
  AND fg.course_instance_id IS NOT DISTINCT FROM fg_duplicates.course_instance_id
  AND fg.user_id IS NOT DISTINCT FROM fg_duplicates.user_id;

-- Rename the old constraint.
ALTER INDEX feature_grants_by_name_idx
RENAME TO feature_grants_by_name_idx_old;

-- Create a new constraint using `NULLS NOT DISTINCT` to prevent duplicates.
ALTER TABLE feature_grants
ADD CONSTRAINT feature_grants_by_name_idx UNIQUE NULLS NOT DISTINCT (
  name,
  institution_id,
  course_id,
  course_instance_id,
  user_id
);

-- Drop the old constraint.
ALTER TABLE feature_grants
DROP CONSTRAINT feature_grants_by_name_idx_old;
