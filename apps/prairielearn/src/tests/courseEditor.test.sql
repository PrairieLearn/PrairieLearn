-- BLOCK update_course_repository
UPDATE pl_courses AS c
SET
  repository = $course_repository
WHERE
  c.path = $course_path;

-- BLOCK select_last_job_sequence
SELECT
  *
FROM
  job_sequences
ORDER BY
  start_date DESC
LIMIT
  1;

-- BLOCK select_job_sequence
SELECT
  *
FROM
  job_sequences
WHERE
  id = $job_sequence_id;

-- BLOCK select_sync_warnings_and_errors
WITH
  course_errors AS (
    SELECT
      'course' AS type,
      path AS id,
      sync_warnings,
      sync_errors
    FROM
      pl_courses
    WHERE
      path = $course_path
      AND (
        sync_warnings IS NOT NULL
        OR sync_warnings != ''
      )
      AND (
        sync_errors IS NOT NULL
        OR sync_errors != ''
      )
  ),
  course_instance_errors AS (
    SELECT
      'course_instance' AS type,
      ci.short_name AS id,
      ci.sync_warnings,
      ci.sync_errors
    FROM
      course_instances AS ci
      JOIN pl_courses AS c ON (ci.course_id = c.id)
    WHERE
      c.path = $course_path
      AND (
        ci.sync_warnings IS NOT NULL
        OR ci.sync_warnings != ''
      )
      AND (
        ci.sync_errors IS NOT NULL
        OR ci.sync_errors != ''
      )
  ),
  question_errors AS (
    SELECT
      'question' AS type,
      q.qid AS id,
      q.sync_warnings,
      q.sync_errors
    FROM
      questions AS q
      JOIN pl_courses AS c ON (q.course_id = c.id)
    WHERE
      c.path = $course_path
      AND (
        q.sync_warnings IS NOT NULL
        OR q.sync_warnings != ''
      )
      AND (
        q.sync_errors IS NOT NULL
        OR q.sync_errors != ''
      )
  ),
  assessment_errors AS (
    SELECT
      'assessment' AS type,
      a.tid AS id,
      a.sync_warnings,
      a.sync_errors
    FROM
      assessments AS a
      JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
      JOIN pl_courses AS c ON (ci.course_id = c.id)
    WHERE
      c.path = $course_path
      AND (
        a.sync_warnings IS NOT NULL
        OR a.sync_warnings != ''
      )
      AND (
        a.sync_errors IS NOT NULL
        OR a.sync_errors != ''
      )
  )
SELECT
  *
FROM
  course_errors
UNION
SELECT
  *
FROM
  course_instance_errors
UNION
SELECT
  *
FROM
  question_errors
UNION
SELECT
  *
FROM
  assessment_errors;
