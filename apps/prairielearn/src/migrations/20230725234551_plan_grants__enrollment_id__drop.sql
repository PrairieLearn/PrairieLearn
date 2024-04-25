-- We're about to drop the enrollment_id column from plan_grants.
-- First, remove any rows that have a non-null value for enrollment_id.
--
-- Technically, this could lead to data loss, but the addition of `enrollment_id`
-- hadn't yet been deployed to production, so there shouldn't be any data to lose.
-- We just want to make sure that we don't end up with rows that don't have their
-- original meaning when we forget that they were scoped to an enrollment.
DELETE FROM plan_grants
WHERE
  enrollment_id IS NOT NULL;

-- Now, create a new index to replace the one that we'll lose when we drop the
-- column, which was part of the original index.
--
-- This index is optimized for looking up the plan grants associated with a specific
-- "entity"; it is not good at telling us every entity that a specific plan has
-- been granted to.
ALTER TABLE plan_grants
ADD CONSTRAINT plan_grants_institution_course_instance_user_name_idx UNIQUE NULLS NOT DISTINCT (
  institution_id,
  course_instance_id,
  user_id,
  plan_name
);

-- Drop the column; this will also remove the old index/constraint.
ALTER TABLE plan_grants
DROP COLUMN IF EXISTS enrollment_id;
