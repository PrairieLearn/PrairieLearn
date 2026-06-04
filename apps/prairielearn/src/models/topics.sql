-- BLOCK select_topics
SELECT
  topic.*
FROM
  topics AS topic
WHERE
  topic.course_id = $course_id
ORDER BY
  topic.number;

-- BLOCK select_topic_by_name
SELECT
  *
FROM
  topics
WHERE
  course_id = $course_id
  AND name = $name;
