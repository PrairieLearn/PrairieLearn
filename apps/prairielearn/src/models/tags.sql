-- BLOCK select_tags
SELECT
  *
FROM
  tags
WHERE
  course_id = $course_id
ORDER BY
  number;

-- BLOCK select_tags_by_question_id
SELECT
  t.*
FROM
  question_tags AS qt
  JOIN tags AS t ON (t.id = qt.tag_id)
WHERE
  qt.question_id = $question_id
ORDER BY
  t.number;

-- BLOCK select_names_for_other_questions
SELECT DISTINCT
  entity.name
FROM
  tags AS entity
  JOIN question_tags AS qt ON qt.tag_id = entity.id
  JOIN questions AS q ON q.id = qt.question_id
WHERE
  entity.course_id = $course_id
  AND q.course_id = $course_id
  AND q.id != $question_id
  AND q.deleted_at IS NULL;
