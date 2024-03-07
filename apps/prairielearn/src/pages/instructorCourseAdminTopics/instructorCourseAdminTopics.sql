-- BLOCK select_topics
SELECT
  topic.*
FROM
  topics AS topic
WHERE
  topic.course_id = $course_id
ORDER BY
  topic.number;
