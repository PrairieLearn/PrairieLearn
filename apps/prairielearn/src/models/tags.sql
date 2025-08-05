-- BLOCK select_tags
SELECT
  *
FROM
  tags
WHERE
  course_id = $course_id
ORDER BY
  number;

-- BLOCK select_tags_for_question
SELECT
  t.*
FROM
  tags AS t
  JOIN question_tags AS qt ON qt.tag_id = t.id
WHERE
  qt.question_id = $question_id
ORDER BY
  t.number;
