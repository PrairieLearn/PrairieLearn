-- BLOCK course
SELECT
  id
FROM
  courses
WHERE
  deleted_at IS NULL
ORDER BY
  id
LIMIT
  1;

-- BLOCK age_operation
UPDATE course_agent_operations
SET
  admitted_at = now() - interval '3 minutes'
WHERE
  id = $id;
