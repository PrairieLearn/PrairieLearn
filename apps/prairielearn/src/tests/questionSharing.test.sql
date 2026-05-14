-- BLOCK update_course_example_course
UPDATE courses
SET
  example_course = $example_course
WHERE
  id = $course_id;

-- BLOCK select_sharing_set
SELECT
  id
FROM
  sharing_sets
WHERE
  name = $sharing_set_name;

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

-- BLOCK set_question_deleted_at
UPDATE questions
SET
  deleted_at = $deleted_at::timestamptz
WHERE
  course_id = $course_id
  AND qid = $qid;

-- BLOCK select_sharing_set_question
SELECT
  ssq.id
FROM
  sharing_set_questions AS ssq
  JOIN sharing_sets AS ss ON ss.id = ssq.sharing_set_id
  JOIN questions AS q ON q.id = ssq.question_id
WHERE
  ss.name = $sharing_set_name
  AND q.qid = $qid
  AND q.course_id = $course_id;
