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
