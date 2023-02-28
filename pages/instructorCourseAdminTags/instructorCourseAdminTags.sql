-- BLOCK select_tags
SELECT
  tag.*
FROM
  tags AS tag
WHERE
  tag.course_id = $course_id
ORDER BY
  tag.number;
