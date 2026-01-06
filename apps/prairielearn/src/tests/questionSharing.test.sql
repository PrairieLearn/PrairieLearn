-- BLOCK get_question_id
SELECT
  id
FROM
  questions
WHERE
  course_id = $course_id
  AND qid = $qid;

-- BLOCK select_sharing_set
SELECT
  id
FROM
  sharing_sets
WHERE
  name = $sharing_set_name;

-- BLOCK update_course_repository
UPDATE courses AS c
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

-- BLOCK select_course_instance
SELECT
  id
FROM
  course_instances
WHERE
  short_name = $short_name
  AND course_id = $course_id;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND course_instance_id = $course_instance_id;
