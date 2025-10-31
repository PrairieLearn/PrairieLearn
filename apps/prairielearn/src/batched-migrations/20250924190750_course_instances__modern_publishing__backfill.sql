-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  course_instances;

-- BLOCK update_course_instances_modern_publishing
UPDATE course_instances
SET
  modern_publishing = TRUE
WHERE
  modern_publishing IS FALSE
  -- We will immediately consider all existing course instances
  -- without any access rules to be using the modern publishing system.
  -- Note that this varies slightly from syncing logic, as this migration considers an empty access rules array
  -- to be a modern publishing course instance, whereas syncing logic considers it to be a legacy course instance.
  -- TODO: This is a problem.
  AND (SELECT COUNT(*) FROM course_instance_access_rules WHERE course_instance_id = course_instances.id) = 0
  AND id >= $start
  AND id <= $end;
