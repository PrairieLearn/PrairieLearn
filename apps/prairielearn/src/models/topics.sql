-- BLOCK select_topics
SELECT
  topic.*
FROM
  topics AS topic
WHERE
  topic.course_id = $course_id
ORDER BY
  topic.number;

-- BLOCK select_names_for_other_questions
SELECT DISTINCT
  entity.name
FROM
  topics AS entity
  JOIN questions AS q ON q.topic_id = entity.id
WHERE
  entity.course_id = $course_id
  AND q.course_id = $course_id
  AND q.id != $question_id
  AND q.deleted_at IS NULL;
