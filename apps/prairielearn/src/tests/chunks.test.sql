-- BLOCK select_course_by_path
SELECT
  *
FROM
  courses
WHERE
  path = $course_path;

-- BLOCK select_course_instance
SELECT
  id
FROM
  course_instances
WHERE
  long_name = $long_name
  AND deleted_at IS NULL;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;

-- BLOCK select_question
SELECT
  id
FROM
  questions
WHERE
  qid = $qid
  AND deleted_at IS NULL;

-- BLOCK prepare_partial_history
WITH
  reset_baseline AS (
    UPDATE courses
    SET
      chunks_history_started_at = NULL
    WHERE
      id = $course_id
    RETURNING
      id
  )
UPDATE chunks
SET
  created_at = NULL
WHERE
  course_id IN (
    SELECT
      id
    FROM
      reset_baseline
  )
  AND type = 'elementExtensions';

-- BLOCK enable_chunk_history
ALTER TABLE chunks
ALTER COLUMN uuid
DROP NOT NULL;

DROP INDEX IF EXISTS chunks_unique_values_key;
