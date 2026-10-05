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

-- BLOCK baseline
UPDATE courses
SET
  commit_hash = $commit_hash,
  sync_errors = $sync_errors
WHERE
  id = $course_id;

-- BLOCK question_errors
UPDATE questions
SET
  sync_errors = $sync_errors
WHERE
  id = (
    SELECT
      id
    FROM
      questions
    WHERE
      course_id = $course_id
      AND deleted_at IS NULL
    ORDER BY
      id
    LIMIT
      1
  );

-- BLOCK age_operation
UPDATE course_agent_operations
SET
  admitted_at = now() - interval '3 minutes'
WHERE
  id = $id;
