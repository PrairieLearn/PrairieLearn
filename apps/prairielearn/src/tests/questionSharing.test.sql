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
