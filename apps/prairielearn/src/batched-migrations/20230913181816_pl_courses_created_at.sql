-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id;

-- BLOCK select_earliest_job_sequence_for_course
SELECT
  MIN(start_date) AS min
FROM
  job_sequences
WHERE
  course_id = $course_id;

-- BLOCK update_course_created_at
UPDATE pl_courses
SET
  created_at = $created_at
WHERE
  id = $course_id;
