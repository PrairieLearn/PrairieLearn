-- BLOCK select_tags
SELECT
  *
FROM
  tags
WHERE
  course_id = $course_id
ORDER BY
  number;
