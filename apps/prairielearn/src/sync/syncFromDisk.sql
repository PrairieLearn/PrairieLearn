-- BLOCK select_course_instance_ids
SELECT
  id,
  short_name
FROM
  course_instances
WHERE
  course_id = $course_id;

-- BLOCK select_question_ids
SELECT
  id,
  qid
FROM
  questions
WHERE
  course_id = $course_id;
