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
  AND (SELECT COUNT(*) FROM course_instance_access_rules WHERE course_instance_id = course_instances.id) = 0
  AND id >= $start
  AND id <= $end;
