-- BLOCK select_example_course
SELECT
  *
FROM
  pl_courses
WHERE
  short_name = 'XC 101'
LIMIT
  1;

-- BLOCK select_questions_for_course
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND topic_id = $topic_id
  AND deleted_at IS NULL
  AND draft IS FALSE;

-- BLOCK select_template_topic_for_course_id
SELECT
  *
FROM
  topics
WHERE
  name = 'Template'
  AND course_id = $course_id
LIMIT
  1;
