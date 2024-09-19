-- BLOCK get_question_id
SELECT
  id
FROM
  questions
WHERE
  course_id = $course_id
  and qid = $qid;

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
